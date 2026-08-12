export const prerender = false;

// Safaricom's server-to-server callback. Not authenticated by session cookie
// (Safaricom has none) — this is the ONLY place a Payment created via
// pay-mpesa.ts can ever become VERIFIED. The STK-push-initiated response to
// the browser is never sufficient proof of payment on its own.

import type { APIRoute } from 'astro';
import { prisma } from '../../../../lib/db';
import { verifyPayment } from '../../../../lib/payments';

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json();
    const callback = body?.Body?.stkCallback;
    if (!callback) return new Response(JSON.stringify({ ResultCode: 1, ResultDesc: 'Invalid payload' }), { status: 400 });

    const { CheckoutRequestID, ResultCode, ResultDesc, CallbackMetadata } = callback;

    const transaction = await prisma.mpesaTransaction.findUnique({ where: { checkoutRequestId: CheckoutRequestID } });
    if (!transaction) return new Response(JSON.stringify({ ResultCode: 0, ResultDesc: 'Unknown transaction, acknowledged' }), { status: 200 });

    const items: { Name: string; Value: unknown }[] = CallbackMetadata?.Item || [];
    const mpesaReceiptNumber = items.find((i) => i.Name === 'MpesaReceiptNumber')?.Value as string | undefined;

    await prisma.mpesaTransaction.update({
      where: { id: transaction.id },
      data: { resultCode: ResultCode, resultDesc: ResultDesc, mpesaReceiptNumber, callbackReceivedAt: new Date() },
    });

    if (ResultCode === 0) {
      await verifyPayment(transaction.paymentId, 'daraja-callback');
    } else {
      await prisma.payment.update({ where: { id: transaction.paymentId }, data: { status: 'REJECTED' } });
    }

    return new Response(JSON.stringify({ ResultCode: 0, ResultDesc: 'Accepted' }), { status: 200 });
  } catch (err) {
    console.error('Daraja callback error', err);
    return new Response(JSON.stringify({ ResultCode: 1, ResultDesc: 'Internal error' }), { status: 500 });
  }
};
