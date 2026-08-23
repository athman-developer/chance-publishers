export const prerender = false;

// Safaricom's server-to-server callback. Not authenticated by session cookie
// (Safaricom has none) — this is the ONLY place a Payment created via
// pay-mpesa.ts can ever become VERIFIED. The STK-push-initiated response to
// the browser is never sufficient proof of payment on its own.
//
// SECURITY: Safaricom does not sign these callbacks, so without a check here
// anyone who discovers this URL plus a valid CheckoutRequestID (trivial to
// obtain — just start any real STK push) could POST a fake "success" payload
// and mark an invoice paid without sending any money. DARAJA_CALLBACK_SECRET
// must be set, and the callback URL registered with Safaricom
// (DARAJA_CALLBACK_URL) must include it as a query param, e.g.
// https://chancepublishers.com/api/portal/webhooks/daraja-callback?secret=<value>

import { timingSafeEqual } from 'node:crypto';
import type { APIRoute } from 'astro';
import { prisma } from '../../../../lib/db';
import { verifyPayment } from '../../../../lib/payments';

function secretMatches(provided: string | null, expected: string): boolean {
  if (!provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export const POST: APIRoute = async ({ request, url }) => {
  const expectedSecret = import.meta.env.DARAJA_CALLBACK_SECRET;
  if (!expectedSecret || !secretMatches(url.searchParams.get('secret'), expectedSecret)) {
    console.error('Daraja callback: missing or invalid secret');
    return new Response(JSON.stringify({ ResultCode: 1, ResultDesc: 'Unauthorized' }), { status: 401 });
  }

  try {
    const body = await request.json();
    const callback = body?.Body?.stkCallback;
    if (!callback) return new Response(JSON.stringify({ ResultCode: 1, ResultDesc: 'Invalid payload' }), { status: 400 });

    const { CheckoutRequestID, ResultCode, ResultDesc, CallbackMetadata } = callback;

    const transaction = await prisma.mpesaTransaction.findUnique({
      where: { checkoutRequestId: CheckoutRequestID },
      include: { payment: true },
    });
    if (!transaction) return new Response(JSON.stringify({ ResultCode: 0, ResultDesc: 'Unknown transaction, acknowledged' }), { status: 200 });

    const items: { Name: string; Value: unknown }[] = CallbackMetadata?.Item || [];
    const mpesaReceiptNumber = items.find((i) => i.Name === 'MpesaReceiptNumber')?.Value as string | undefined;
    const amountPaid = items.find((i) => i.Name === 'Amount')?.Value as number | undefined;

    await prisma.mpesaTransaction.update({
      where: { id: transaction.id },
      data: { resultCode: ResultCode, resultDesc: ResultDesc, mpesaReceiptNumber, callbackReceivedAt: new Date() },
    });

    // Defense in depth: even with a valid secret, a mismatched amount means
    // something is wrong — don't silently mark the invoice paid.
    const amountMatches = amountPaid === undefined || Math.round(Number(transaction.payment.amountKes)) === Math.round(amountPaid);

    if (ResultCode === 0 && amountMatches) {
      await verifyPayment(transaction.paymentId, 'daraja-callback');
    } else {
      const note = ResultCode === 0 ? `amount mismatch: expected ${transaction.payment.amountKes}, got ${amountPaid}` : ResultDesc;
      console.error('Daraja callback: payment rejected', note);
      await prisma.payment.update({ where: { id: transaction.paymentId }, data: { status: 'REJECTED' } });
    }

    return new Response(JSON.stringify({ ResultCode: 0, ResultDesc: 'Accepted' }), { status: 200 });
  } catch (err) {
    console.error('Daraja callback error', err);
    return new Response(JSON.stringify({ ResultCode: 1, ResultDesc: 'Internal error' }), { status: 500 });
  }
};
