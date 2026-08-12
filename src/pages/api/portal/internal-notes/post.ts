export const prerender = false;

import type { APIRoute } from 'astro';
import { prisma } from '../../../../lib/db';
import { userHasRole } from '../../../../lib/auth/session';

export const POST: APIRoute = async ({ request, locals, redirect }) => {
  const user = locals.user;
  if (!user) return redirect('/portal/login');

  const data = await request.formData();
  const projectId = String(data.get('projectId') || '');
  const body = String(data.get('body') || '').trim();
  if (!projectId || !body) return redirect(`/portal/projects/${projectId}/messages`);

  const isAdmin = userHasRole(user, 'ADMIN') || userHasRole(user, 'SUPER_ADMIN');
  const hasAssignedTask = !isAdmin
    ? (await prisma.task.count({ where: { projectId, assignedToUserId: user.id } })) > 0
    : false;
  if (!isAdmin && !hasAssignedTask) return redirect('/portal/author');

  await prisma.internalNote.create({ data: { projectId, authorUserId: user.id, body } });

  return redirect(`/portal/projects/${projectId}/messages`);
};
