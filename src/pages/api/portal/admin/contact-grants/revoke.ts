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
  const grantId = String(data.get('grantId') || '');

  const grant = await prisma.contactShareGrant.findUnique({ where: { id: grantId } });
  if (grant) {
    await prisma.contactShareGrant.update({ where: { id: grantId }, data: { revokedAt: new Date() } });
  }

  return redirect(`/portal/admin/projects/${grant?.projectId}`);
};
