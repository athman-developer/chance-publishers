export const prerender = false;

import type { APIRoute } from 'astro';
import { prisma } from '../../../../lib/db';
import { getStorage } from '../../../../lib/storage';
import { fillTemplate, renderNdaPdf } from '../../../../lib/nda';
import { userHasRole } from '../../../../lib/auth/session';
import { notify, logActivity } from '../../../../lib/notify';

export const POST: APIRoute = async ({ request, locals, redirect, clientAddress }) => {
  const user = locals.user;
  if (!user || !userHasRole(user, 'ADMIN') && !userHasRole(user, 'SUPER_ADMIN')) {
    return redirect('/portal/login');
  }

  const data = await request.formData();
  const ndaId = String(data.get('ndaId') || '');
  const signerName = String(data.get('signerName') || 'Chance Publishers Limited').trim();
  const signatureData = String(data.get('signatureData') || signerName).trim();

  const nda = await prisma.ndaAgreement.findUnique({
    where: { id: ndaId },
    include: {
      template: true,
      signatures: true,
      project: { include: { author: { include: { authorProfile: true } }, contributors: true } },
    },
  });
  if (!nda || nda.status !== 'AWAITING_PUBLISHER_SIGNATURE') {
    return redirect('/portal/admin');
  }

  await prisma.ndaSignature.create({
    data: {
      ndaAgreementId: nda.id,
      signerRole: 'PUBLISHER',
      signerName,
      method: 'TYPED',
      signatureData,
      ipAddress: clientAddress,
      userAgent: request.headers.get('user-agent') || undefined,
    },
  });

  const authorSig = nda.signatures.find((s) => s.signerRole === 'AUTHOR');
  const witnessSig = nda.signatures.find((s) => s.signerRole === 'WITNESS');
  const author = nda.project.author.authorProfile;

  const body = fillTemplate(nda.template.bodyMarkdown, {
    NDA_REFERENCE: nda.ndaNumber,
    AGREEMENT_DATE: nda.createdAt.toLocaleDateString('en-GB'),
    AUTHOR_FULL_NAME: author?.fullLegalName || nda.project.author.email,
    AUTHOR_ID_OR_PASSPORT: nda.authorIdOrPassport || '—',
    BOOK_TITLE: nda.project.title,
    EDITION: nda.project.edition || '1st Edition',
    CONTRIBUTORS: nda.project.contributors.map((c) => c.name).join(', ') || 'None',
    ALTERNATIVE_CONTACT_NAME: nda.altContactName || '—',
    ALTERNATIVE_CONTACT_RELATIONSHIP: nda.altContactRelationship || '—',
    ALTERNATIVE_CONTACT_PHONE: nda.altContactPhone || '—',
    ALTERNATIVE_CONTACT_ID: nda.altContactIdOrPassport || '—',
    ALTERNATIVE_CONTACT_EMAIL: nda.altContactEmail || '—',
    PUBLISHER_SIGNATORY: signerName,
    AUTHOR_SIGNATURE: authorSig ? `${authorSig.signerName} (signed ${authorSig.signedAt.toLocaleString('en-GB')})` : '—',
    WITNESS_NAME: nda.witnessName || witnessSig?.signerName || 'N/A',
    WITNESS_ID: nda.witnessIdNumber || 'N/A',
    WITNESS_SIGNATURE: witnessSig ? `${witnessSig.signerName} (signed ${witnessSig.signedAt.toLocaleString('en-GB')})` : 'N/A',
    SIGNATURE_DATE: new Date().toLocaleDateString('en-GB'),
  });

  const pdfBuffer = await renderNdaPdf(body, `EXECUTED NDA — ${nda.ndaNumber}`);
  const storage = await getStorage();
  const key = `nda/${nda.projectId}/${nda.ndaNumber}-executed.pdf`;
  await storage.put(key, pdfBuffer, 'application/pdf');

  await prisma.$transaction([
    prisma.ndaAgreement.update({
      where: { id: nda.id },
      data: { status: 'EXECUTED', executedPdfKey: key },
    }),
    prisma.bookProject.update({
      where: { id: nda.projectId },
      data: { currentStageKey: 'MANUSCRIPT_SUBMITTED', overallProgress: 10 },
    }),
  ]);

  await notify(
    nda.project.authorId,
    'NDA_EXECUTED',
    `Your NDA (${nda.ndaNumber}) has been executed — you can now submit your manuscript.`,
    `/portal/author/projects/${nda.projectId}/nda`,
  );
  await logActivity(nda.projectId, `NDA ${nda.ndaNumber} executed — countersigned by ${signerName}`);

  return redirect(`/portal/admin/nda/${nda.id}`);
};
