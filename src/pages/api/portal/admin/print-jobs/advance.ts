export const prerender = false;

import type { APIRoute } from 'astro';
import { userHasRole } from '../../../../../lib/auth/session';
import { advancePrintJob } from '../../../../../lib/print-jobs';

export const POST: APIRoute = async ({ request, locals, redirect }) => {
  const user = locals.user;
  if (!user || (!userHasRole(user, 'ADMIN') && !userHasRole(user, 'SUPER_ADMIN'))) {
    return redirect('/portal/login');
  }

  const data = await request.formData();
  const printJobId = String(data.get('printJobId') || '');
  const targetStatus = String(data.get('targetStatus') || '') as any;

  let error = '';
  try {
    await advancePrintJob(printJobId, targetStatus);
  } catch (err) {
    error = err instanceof Error ? err.message : 'Could not advance.';
  }

  return redirect(`/portal/print-jobs/${printJobId}${error ? `?error=${encodeURIComponent(error)}` : ''}`);
};
