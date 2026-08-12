export const prerender = false;

import type { APIRoute } from 'astro';
import { prisma } from '../../../../lib/db';

export const POST: APIRoute = async ({ request, locals, redirect, clientAddress }) => {
  const user = locals.user;
  if (!user) return redirect('/portal/login');

  const data = await request.formData();
  const projectId = String(data.get('projectId') || '');
  const role = String(data.get('role') || ''); // AUTHOR | WITNESS
  const signerName = String(data.get('signerName') || '').trim();
  const method = String(data.get('method') || 'TYPED'); // TYPED | DRAWN
  const signatureData = String(data.get('signatureData') || '').trim();
  const witnessName = String(data.get('witnessName') || '').trim();
  const witnessIdNumber = String(data.get('witnessIdNumber') || '').trim();

  const project = await prisma.bookProject.findUnique({
    where: { id: projectId },
    include: { ndaAgreement: { include: { template: true } } },
  });
  const nda = project?.ndaAgreement;
  if (!project || project.authorId !== user.id || !nda) return redirect('/portal/author');
  if (!signerName || !signatureData) {
    return redirect(`/portal/author/projects/${projectId}/nda?error=missing-signature`);
  }

  if (role === 'AUTHOR' && nda.status === 'AWAITING_AUTHOR_SIGNATURE') {
    await prisma.$transaction([
      prisma.ndaSignature.create({
        data: {
          ndaAgreementId: nda.id,
          signerRole: 'AUTHOR',
          signerName,
          method: method === 'DRAWN' ? 'DRAWN' : 'TYPED',
          signatureData,
          ipAddress: clientAddress,
          userAgent: request.headers.get('user-agent') || undefined,
        },
      }),
      prisma.ndaAgreement.update({
        where: { id: nda.id },
        data: {
          status: nda.template.witnessRequired ? 'AWAITING_WITNESS' : 'AWAITING_PUBLISHER_SIGNATURE',
          witnessName: nda.template.witnessRequired ? null : nda.witnessName,
        },
      }),
    ]);
  } else if (role === 'WITNESS' && nda.status === 'AWAITING_WITNESS') {
    await prisma.$transaction([
      prisma.ndaSignature.create({
        data: {
          ndaAgreementId: nda.id,
          signerRole: 'WITNESS',
          signerName,
          method: method === 'DRAWN' ? 'DRAWN' : 'TYPED',
          signatureData,
          ipAddress: clientAddress,
          userAgent: request.headers.get('user-agent') || undefined,
        },
      }),
      prisma.ndaAgreement.update({
        where: { id: nda.id },
        data: { status: 'AWAITING_PUBLISHER_SIGNATURE', witnessName, witnessIdNumber },
      }),
    ]);
  } else {
    return redirect(`/portal/author/projects/${projectId}/nda?error=invalid-state`);
  }

  return redirect(`/portal/author/projects/${projectId}/nda`);
};
