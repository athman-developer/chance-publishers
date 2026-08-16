export const prerender = false;

import type { APIRoute } from 'astro';
import { prisma } from '../../../../../lib/db';

export const POST: APIRoute = async ({ request, locals, redirect }) => {
  const user = locals.user;
  if (!user) return redirect('/portal/login');

  const data = await request.formData();
  const payoutMethod = String(data.get('payoutMethod') || '');
  const mpesaNumber = String(data.get('mpesaNumber') || '').trim();
  const bankName = String(data.get('bankName') || '').trim();
  const bankAccountName = String(data.get('bankAccountName') || '').trim();
  const bankAccountNumber = String(data.get('bankAccountNumber') || '').trim();
  const bankBranch = String(data.get('bankBranch') || '').trim();

  await prisma.employeeProfile.update({
    where: { userId: user.id },
    data: {
      payoutMethod: payoutMethod === 'BANK' ? 'BANK' : payoutMethod === 'MPESA' ? 'MPESA' : null,
      mpesaNumber: mpesaNumber || null,
      bankName: bankName || null,
      bankAccountName: bankAccountName || null,
      bankAccountNumber: bankAccountNumber || null,
      bankBranch: bankBranch || null,
    },
  });

  return redirect('/portal/employee/settings?paySuccess=1');
};
