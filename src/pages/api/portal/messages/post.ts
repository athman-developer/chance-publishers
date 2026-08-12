export const prerender = false;

import type { APIRoute } from 'astro';
import { prisma } from '../../../../lib/db';
import { userHasRole } from '../../../../lib/auth/session';
import { notify, notifyAdmins } from '../../../../lib/notify';

export const POST: APIRoute = async ({ request, locals, redirect }) => {
  const user = locals.user;
  if (!user) return redirect('/portal/login');

  const data = await request.formData();
  const projectId = String(data.get('projectId') || '');
  const body = String(data.get('body') || '').trim();
  if (!projectId || !body) return redirect(`/portal/projects/${projectId}/messages`);

  const project = await prisma.bookProject.findUnique({ where: { id: projectId } });
  if (!project) return redirect('/portal/author');

  const isOwner = project.authorId === user.id;
  const isAdmin = userHasRole(user, 'ADMIN') || userHasRole(user, 'SUPER_ADMIN');
  const hasAssignedTask = !isOwner && !isAdmin
    ? (await prisma.task.count({ where: { projectId, assignedToUserId: user.id } })) > 0
    : false;
  if (!isOwner && !isAdmin && !hasAssignedTask) return redirect('/portal/author');

  await prisma.message.create({ data: { projectId, authorUserId: user.id, body } });

  if (isOwner) {
    await notifyAdmins('MESSAGE_POSTED', `New message from the author on "${project.title}"`, `/portal/projects/${projectId}/messages`);
  } else {
    await notify(project.authorId, 'MESSAGE_POSTED', `New message on "${project.title}"`, `/portal/projects/${projectId}/messages`);
  }

  return redirect(`/portal/projects/${projectId}/messages`);
};
