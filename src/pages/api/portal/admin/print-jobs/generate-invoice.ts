export const prerender = false;

import type { APIRoute } from 'astro';
import { userHasRole } from '../../../../../lib/auth/session';
import { generateClientInvoice } from '../../../../../lib/print-jobs';

export const POST: APIRoute = async ({ request, locals, redirect }) => {
  const user = locals.user;
  if (!user || (!userHasRole(user, 'ADMIN') && !userHasRole(user, 'SUPER_ADMIN'))) {
    return redirect('/portal/login');
  }

  const data = await request.formData();
  const printJobId = String(data.get('printJobId') || '');
  await generateClientInvoice(printJobId).catch(() => {});

  return redirect(`/portal/print-jobs/${printJobId}`);
};
