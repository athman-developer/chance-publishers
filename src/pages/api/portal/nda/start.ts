export const prerender = false;

import type { APIRoute } from 'astro';
import { prisma } from '../../../../lib/db';
import { nextDocumentNumber } from '../../../../lib/documents';

export const POST: APIRoute = async ({ request, locals, redirect }) => {
  const user = locals.user;
  if (!user) return redirect('/portal/login');

  const data = await request.formData();
  const projectId = String(data.get('projectId') || '');
  const project = await prisma.bookProject.findUnique({ where: { id: projectId } });
  if (!project || project.authorId !== user.id) return redirect('/portal/author');

  const existing = await prisma.ndaAgreement.findUnique({ where: { projectId } });
  if (existing) return redirect(`/portal/author/projects/${projectId}/nda`);

  const template = await prisma.ndaTemplate.findFirst({
    where: { status: 'DRAFT' },
    orderBy: { createdAt: 'desc' },
  });
  if (!template) {
    return redirect(`/portal/author/projects/${projectId}/nda?error=no-template`);
  }

  const authorIdOrPassport = String(data.get('authorIdOrPassport') || '').trim();
  const authorAddress = String(data.get('authorAddress') || '').trim();
  const altContactName = String(data.get('altContactName') || '').trim();
  const altContactRelationship = String(data.get('altContactRelationship') || '').trim();
  const altContactPhone = String(data.get('altContactPhone') || '').trim();
  const altContactIdOrPassport = String(data.get('altContactIdOrPassport') || '').trim();
  const altContactEmail = String(data.get('altContactEmail') || '').trim();

  const ndaNumber = await nextDocumentNumber('NDA');
  const invoiceNumber = await nextDocumentNumber('INV');

  const feeSetting = await prisma.systemSetting.findUnique({ where: { key: 'NDA_FEE_KES' } });
  const feeAmount = Number(feeSetting?.value ?? '1000');

  await prisma.$transaction(async (tx) => {
    const nda = await tx.ndaAgreement.create({
      data: {
        ndaNumber,
        projectId,
        templateId: template.id,
        status: 'FEE_INVOICED',
        authorIdOrPassport,
        authorAddress,
        altContactName,
        altContactRelationship,
        altContactPhone,
        altContactIdOrPassport,
        altContactEmail,
      },
    });
    await tx.invoice.create({
      data: {
        invoiceNumber,
        projectId,
        type: 'NDA_FEE',
        status: 'SENT',
        amountKes: feeAmount,
        description: 'NDA processing fee',
        ndaAgreementId: nda.id,
      },
    });
  });

  // Also save the ID/passport and address back onto the author's profile for reuse.
  await prisma.authorProfile.update({
    where: { userId: user.id },
    data: {
      idOrPassportNumber: authorIdOrPassport || undefined,
      address: authorAddress || undefined,
    },
  }).catch(() => {});

  return redirect(`/portal/author/projects/${projectId}/nda`);
};
