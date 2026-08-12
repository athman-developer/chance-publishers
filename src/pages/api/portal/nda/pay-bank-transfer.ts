export const prerender = false;

import type { APIRoute } from 'astro';
import { randomBytes } from 'node:crypto';
import { prisma } from '../../../../lib/db';
import { getStorage } from '../../../../lib/storage';
import { validateUpload, PROOF_TYPES } from '../../../../lib/upload-validation';

export const POST: APIRoute = async ({ request, locals, redirect }) => {
  const user = locals.user;
  if (!user) return redirect('/portal/login');

  const data = await request.formData();
  const projectId = String(data.get('projectId') || '');
  const reference = String(data.get('reference') || '').trim();
  const proof = data.get('proof');

  const project = await prisma.bookProject.findUnique({
    where: { id: projectId },
    include: { ndaAgreement: { include: { invoice: true } } },
  });
  if (!project || project.authorId !== user.id || !project.ndaAgreement?.invoice) {
    return redirect('/portal/author');
  }

  const invoice = project.ndaAgreement.invoice;
  let proofFileKey: string | null = null;

  if (proof instanceof File && proof.size > 0) {
    const validated = validateUpload(proof, PROOF_TYPES);
    if (!validated.ok) {
      return redirect(`/portal/author/projects/${projectId}/nda?error=${validated.error}`);
    }
    const storage = await getStorage();
    const buffer = Buffer.from(await validated.file.arrayBuffer());
    proofFileKey = `payment-proofs/${projectId}/${randomBytes(8).toString('hex')}-${validated.file.name}`;
    await storage.put(proofFileKey, buffer, validated.file.type);
    await prisma.fileAsset.create({
      data: {
        projectId,
        kind: 'PAYMENT_PROOF',
        storageKey: proofFileKey,
        originalFilename: validated.file.name,
        contentType: validated.file.type,
        sizeBytes: buffer.length,
        uploadedByUserId: user.id,
      },
    });
  }

  await prisma.payment.create({
    data: {
      invoiceId: invoice.id,
      method: 'BANK_TRANSFER',
      amountKes: invoice.amountKes,
      status: 'PENDING_VERIFICATION',
      proofFileKey,
      reference: reference || null,
    },
  });

  return redirect(`/portal/author/projects/${projectId}/nda?submitted=1`);
};
