export const prerender = false;

import type { APIRoute } from 'astro';
import { prisma } from '../../../../../lib/db';
import { userHasRole } from '../../../../../lib/auth/session';
import { recordChequePayment } from '../../../../../lib/payments';

export const POST: APIRoute = async ({ request, locals, redirect }) => {
  const user = locals.user;
  if (!user || (!userHasRole(user, 'ADMIN') && !userHasRole(user, 'SUPER_ADMIN'))) {
    return redirect('/portal/login');
  }

  const data = await request.formData();
  const invoiceId = String(data.get('invoiceId') || '');
  const amount = Number(data.get('amount') || 0);
  const chequeNumber = String(data.get('chequeNumber') || '').trim();
  const bank = String(data.get('bank') || '').trim();
  const drawer = String(data.get('drawer') || '').trim();

  if (!invoiceId || amount <= 0 || !chequeNumber || !bank || !drawer) {
    return redirect(`/portal/invoices/${invoiceId}?error=missing-cheque-fields`);
  }

  await recordChequePayment(invoiceId, amount, { chequeNumber, bank, drawer }, user.id);
  return redirect(`/portal/invoices/${invoiceId}`);
};
