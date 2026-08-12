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
  const projectId = String(data.get('projectId') || '');

  if (requestId && projectId) {
    await prisma.launchRequest.update({ where: { id: requestId }, data: { projectId, status: 'CONTACTED' } });
  }

  return redirect('/portal/admin/launches');
};
