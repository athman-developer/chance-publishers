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
  const projectId = String(data.get('projectId') || '');
  const employeeUserId = String(data.get('employeeUserId') || '');
  const level = String(data.get('level') || '') as any;

  const project = await prisma.bookProject.findUnique({ where: { id: projectId } });
  if (!project || !employeeUserId || !['WORK_EMAIL', 'PHONE', 'PHONE_AND_EMAIL'].includes(level)) {
    return redirect(`/portal/admin/projects/${projectId}`);
  }

  await prisma.contactShareGrant.create({
    data: {
      employeeUserId,
      authorUserId: project.authorId,
      projectId,
      level,
      grantedByUserId: user.id,
    },
  });

  return redirect(`/portal/admin/projects/${projectId}`);
};
