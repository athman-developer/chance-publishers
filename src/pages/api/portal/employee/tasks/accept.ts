export const prerender = false;

import type { APIRoute } from 'astro';
import { prisma } from '../../../../../lib/db';

export const POST: APIRoute = async ({ request, locals, redirect }) => {
  const user = locals.user;
  if (!user) return redirect('/portal/login');

  const data = await request.formData();
  const taskId = String(data.get('taskId') || '');
  const task = await prisma.task.findUnique({ where: { id: taskId } });
  if (!task || task.assignedToUserId !== user.id || task.status !== 'ASSIGNED') {
    return redirect('/portal/employee');
  }

  await prisma.task.update({
    where: { id: taskId },
    data: { status: 'IN_PROGRESS', startedAt: new Date() },
  });

  return redirect(`/portal/employee/tasks/${taskId}`);
};
