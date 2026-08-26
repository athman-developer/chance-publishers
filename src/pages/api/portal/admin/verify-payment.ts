export const prerender = false;

import type { APIRoute } from 'astro';
import { prisma } from '../../../../lib/db';
import { userHasRole } from '../../../../lib/auth/session';
import { verifyPayment } from '../../../../lib/payments';
import { logAdminAction } from '../../../../lib/audit';

export const POST: APIRoute = async ({ request, locals, redirect }) => {
  const user = locals.user;
  if (!user || (!userHasRole(user, 'ADMIN') && !userHasRole(user, 'SUPER_ADMIN'))) {
    return redirect('/portal/login');
  }

  const data = await request.formData();
  const paymentId = String(data.get('paymentId') || '');
  const action = String(data.get('action') || 'verify');

  if (action === 'reject') {
    const payment = await prisma.payment.update({ where: { id: paymentId }, data: { status: 'REJECTED' } });
    await logAdminAction(user.id, 'PAYMENT_REJECTED', 'Payment', paymentId, `${payment.method.replaceAll('_', ' ')} · KSh ${Number(payment.amountKes).toLocaleString()}`);
  } else {
    await verifyPayment(paymentId, user.id);
  }

  return redirect('/portal/admin/payments');
};
