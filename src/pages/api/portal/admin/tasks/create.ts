export const prerender = false;

import type { APIRoute } from 'astro';
import { prisma } from '../../../../../lib/db';
import { nextDocumentNumber } from '../../../../../lib/documents';
import { userHasRole } from '../../../../../lib/auth/session';
import { taskTypeConfig } from '../../../../../lib/workflow';
import { notify, logActivity } from '../../../../../lib/notify';

export const POST: APIRoute = async ({ request, locals, redirect }) => {
  const user = locals.user;
  if (!user || (!userHasRole(user, 'ADMIN') && !userHasRole(user, 'SUPER_ADMIN'))) {
    return redirect('/portal/login');
  }

  const data = await request.formData();
  const projectId = String(data.get('projectId') || '');
  const taskType = String(data.get('taskType') || '');
  const assignedToUserId = String(data.get('assignedToUserId') || '');
  const dueDateRaw = String(data.get('dueDate') || '');
  const priority = String(data.get('priority') || 'NORMAL');
  const instructions = String(data.get('instructions') || '').trim() || null;

  const config = taskTypeConfig(taskType);
  if (!projectId || !config || !assignedToUserId) {
    return redirect(`/portal/admin/projects/${projectId}?error=missing-fields`);
  }

  const taskNumber = await nextDocumentNumber('TSK');

  const task = await prisma.task.create({
    data: {
      taskNumber,
      projectId,
      stageKey: config.stageKey,
      taskType: config.key,
      assignedToUserId,
      assignedByUserId: user.id,
      status: 'ASSIGNED',
      priority: priority as any,
      instructions,
      dueDate: dueDateRaw ? new Date(dueDateRaw) : null,
    },
  });

  await notify(assignedToUserId, 'TASK_ASSIGNED', `New task assigned: ${config.key.replaceAll('_', ' ')}`, `/portal/employee/tasks/${task.id}`);
  await logActivity(projectId, `Task ${taskNumber} (${config.key.replaceAll('_', ' ')}) assigned`);

  return redirect(`/portal/admin/projects/${projectId}`);
};
