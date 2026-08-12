export const prerender = false;

import type { APIRoute } from 'astro';
import { prisma } from '../../../../lib/db';
import { initiateStkPush, isDarajaConfigured } from '../../../../lib/daraja';

export const POST: APIRoute = async ({ request, locals }) => {
  const user = locals.user;
  if (!user) return new Response(JSON.stringify({ ok: false, error: 'unauthorized' }), { status: 401 });

  if (!isDarajaConfigured()) {
    return new Response(
      JSON.stringify({ ok: false, error: 'M-Pesa payments are not yet configured for this site. Please use bank transfer for now.' }),
      { status: 503 },
    );
  }

  const data = await request.formData();
  const invoiceId = String(data.get('invoiceId') || '');
  const phoneNumber = String(data.get('phoneNumber') || '').trim();

  const invoice = await prisma.invoice.findUnique({ where: { id: invoiceId }, include: { project: true } });
  if (!invoice || invoice.project.authorId !== user.id) {
    return new Response(JSON.stringify({ ok: false, error: 'not-found' }), { status: 404 });
  }
  if (!/^2547\d{8}$/.test(phoneNumber)) {
    return new Response(JSON.stringify({ ok: false, error: 'Enter a valid phone number in the format 2547XXXXXXXX.' }), { status: 400 });
  }

  const payment = await prisma.payment.create({
    data: { invoiceId, method: 'MPESA', amountKes: invoice.amountKes, status: 'PENDING_VERIFICATION' },
  });

  const result = await initiateStkPush({
    phoneNumber,
    amountKes: Number(invoice.amountKes),
    accountReference: invoice.invoiceNumber,
    transactionDesc: `Chance Publishers — ${invoice.invoiceNumber}`,
  });

  if (!result.ok) {
    await prisma.payment.update({ where: { id: payment.id }, data: { status: 'REJECTED' } });
    return new Response(JSON.stringify({ ok: false, error: result.error }), { status: 502 });
  }

  await prisma.mpesaTransaction.create({
    data: {
      paymentId: payment.id,
      merchantRequestId: result.merchantRequestId!,
      checkoutRequestId: result.checkoutRequestId!,
      phoneNumber,
    },
  });

  return new Response(JSON.stringify({ ok: true }), { status: 200 });
};
