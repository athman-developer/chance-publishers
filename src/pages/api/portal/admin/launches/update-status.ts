export const prerender = false;

import type { APIRoute } from 'astro';
import { prisma } from '../../../../../lib/db';
import { userHasRole } from '../../../../../lib/auth/session';

export const POST: APIRoute = async ({ request, locals, redirect }) => {
  const user = locals.user;
  if (!user || (!userHasRole(user, 'ADMIN') && !userHasRole(user, 'SUPER_ADMIN'))) {
    return redirect('/portal/login');
  }

  const data = await request.formData();
  const requestId = String(data.get('requestId') || '');
  const status = String(data.get('status') || '') as any;

  if (requestId && ['NEW', 'CONTACTED', 'QUOTED', 'CONVERTED', 'CLOSED'].includes(status)) {
    await prisma.launchRequest.update({ where: { id: requestId }, data: { status } });
  }

  return redirect('/portal/admin/launches');
};
