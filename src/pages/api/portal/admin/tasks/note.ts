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
  const taskId = String(data.get('taskId') || '');
  const body = String(data.get('body') || '').trim();
  const task = await prisma.task.findUnique({ where: { id: taskId } });
  if (!task || !body) return redirect('/portal/admin');

  await prisma.internalNote.create({
    data: { projectId: task.projectId, taskId, authorUserId: user.id, body },
  });

  return redirect(`/portal/admin/tasks/${taskId}`);
};
