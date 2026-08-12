export const prerender = false;

import type { APIRoute } from 'astro';
import { prisma } from '../../../../lib/db';
import { userHasRole } from '../../../../lib/auth/session';
import { verifyPayment } from '../../../../lib/payments';

export const POST: APIRoute = async ({ request, locals, redirect }) => {
  const user = locals.user;
  if (!user || (!userHasRole(user, 'ADMIN') && !userHasRole(user, 'SUPER_ADMIN'))) {
    return redirect('/portal/login');
  }

  const data = await request.formData();
  const paymentId = String(data.get('paymentId') || '');
  const action = String(data.get('action') || 'verify');

  if (action === 'reject') {
    await prisma.payment.update({ where: { id: paymentId }, data: { status: 'REJECTED' } });
  } else {
    await verifyPayment(paymentId, user.id);
  }

  return redirect('/portal/admin/payments');
};
