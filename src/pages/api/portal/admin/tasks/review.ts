export const prerender = false;

import type { APIRoute } from 'astro';
import { prisma } from '../../../../../lib/db';
import { userHasRole } from '../../../../../lib/auth/session';
import { taskTypeConfig, completeTaskAndAdvanceProject } from '../../../../../lib/workflow';
import { notify, logActivity } from '../../../../../lib/notify';

export const POST: APIRoute = async ({ request, locals, redirect }) => {
  const user = locals.user;
  if (!user || (!userHasRole(user, 'ADMIN') && !userHasRole(user, 'SUPER_ADMIN'))) {
    return redirect('/portal/login');
  }

  const data = await request.formData();
  const taskId = String(data.get('taskId') || '');
  const action = String(data.get('action') || '');
  const note = String(data.get('note') || '').trim();

  const task = await prisma.task.findUnique({ where: { id: taskId }, include: { fileAssets: { orderBy: { version: 'desc' } } } });
  if (!task || task.status !== 'SUBMITTED_FOR_REVIEW') return redirect('/portal/admin');

  if (action === 'request-changes') {
    await prisma.task.update({
      where: { id: taskId },
      data: { status: 'CHANGES_REQUESTED', changeRequestNote: note || 'Please review and resubmit.' },
    });
    await notify(task.assignedToUserId!, 'OTHER', `Changes requested on ${task.taskNumber}: ${note || 'Please review and resubmit.'}`, `/portal/employee/tasks/${taskId}`);
    await logActivity(task.projectId, `${task.taskNumber} sent back for changes`);
    return redirect(`/portal/admin/tasks/${taskId}`);
  }

  if (action === 'approve') {
    const config = taskTypeConfig(task.taskType);
    const latestDeliverable = task.fileAssets[0];
    const project = await prisma.bookProject.findUniqueOrThrow({ where: { id: task.projectId } });

    if (config?.requiresAuthorApproval && latestDeliverable) {
      await prisma.$transaction([
        prisma.task.update({ where: { id: taskId }, data: { status: 'APPROVED' } }),
        prisma.approval.create({
          data: {
            projectId: task.projectId,
            taskId: task.id,
            fileAssetId: latestDeliverable.id,
            kind: config.approvalKind as any,
            status: 'PENDING',
            requestedByUserId: user.id,
          },
        }),
      ]);
      await notify(project.authorId, 'APPROVAL_REQUIRED', `${config.approvalKind.replaceAll('_', ' ')} is ready for your review`, `/portal/author/projects/${task.projectId}`);
    } else {
      await completeTaskAndAdvanceProject(prisma, taskId);
    }
    await logActivity(task.projectId, `${task.taskNumber} approved`);
    return redirect(`/portal/admin/tasks/${taskId}`);
  }

  return redirect(`/portal/admin/tasks/${taskId}`);
};
