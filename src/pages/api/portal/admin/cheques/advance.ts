export const prerender = false;

import type { APIRoute } from 'astro';
import { prisma } from '../../../../../lib/db';
import { userHasRole } from '../../../../../lib/auth/session';
import { advanceCheque } from '../../../../../lib/payments';

export const POST: APIRoute = async ({ request, locals, redirect }) => {
  const user = locals.user;
  if (!user || (!userHasRole(user, 'ADMIN') && !userHasRole(user, 'SUPER_ADMIN'))) {
    return redirect('/portal/login');
  }

  const data = await request.formData();
  const chequeId = String(data.get('chequeId') || '');
  const invoiceId = String(data.get('invoiceId') || '');
  const action = String(data.get('action') || '') as 'deposit' | 'clear' | 'bounce';

  if (chequeId && ['deposit', 'clear', 'bounce'].includes(action)) {
    await advanceCheque(chequeId, action, user.id);
  }

  return redirect(`/portal/invoices/${invoiceId}`);
};
