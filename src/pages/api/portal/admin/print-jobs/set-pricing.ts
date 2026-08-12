export const prerender = false;

import type { APIRoute } from 'astro';
import { userHasRole } from '../../../../../lib/auth/session';
import { setPricingAndApprove } from '../../../../../lib/print-jobs';

export const POST: APIRoute = async ({ request, locals, redirect }) => {
  const user = locals.user;
  if (!user || (!userHasRole(user, 'ADMIN') && !userHasRole(user, 'SUPER_ADMIN'))) {
    return redirect('/portal/login');
  }

  const data = await request.formData();
  const printJobId = String(data.get('printJobId') || '');
  const supplierPriceKes = Number(data.get('supplierPriceKes') || 0);
  const clientPriceKes = Number(data.get('clientPriceKes') || 0);
  const turnaroundDays = Number(data.get('turnaroundDays') || 0);
  const printerName = String(data.get('printerName') || '').trim();

  if (supplierPriceKes > 0 && clientPriceKes > 0 && turnaroundDays > 0 && printerName) {
    await setPricingAndApprove(printJobId, { supplierPriceKes, clientPriceKes, turnaroundDays, printerName });
  }

  return redirect(`/portal/print-jobs/${printJobId}`);
};
