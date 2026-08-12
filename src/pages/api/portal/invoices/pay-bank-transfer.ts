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
  const invoiceId = String(data.get('invoiceId') || '');
  const reference = String(data.get('reference') || '').trim();
  const proof = data.get('proof');

  const invoice = await prisma.invoice.findUnique({ where: { id: invoiceId }, include: { project: true } });
  if (!invoice || invoice.project.authorId !== user.id) return redirect('/portal/author');

  let proofFileKey: string | null = null;
  if (proof instanceof File && proof.size > 0) {
    const validated = validateUpload(proof, PROOF_TYPES);
    if (!validated.ok) return redirect(`/portal/invoices/${invoiceId}?error=${validated.error}`);
    const storage = await getStorage();
    const buffer = Buffer.from(await validated.file.arrayBuffer());
    proofFileKey = `payment-proofs/${invoice.projectId}/${randomBytes(8).toString('hex')}-${validated.file.name}`;
    await storage.put(proofFileKey, buffer, validated.file.type);
    await prisma.fileAsset.create({
      data: {
        projectId: invoice.projectId,
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
      invoiceId,
      method: 'BANK_TRANSFER',
      amountKes: invoice.amountKes,
      status: 'PENDING_VERIFICATION',
      proofFileKey,
      reference: reference || null,
    },
  });

  return redirect(`/portal/invoices/${invoiceId}?submitted=1`);
};
