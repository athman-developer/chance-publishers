export const prerender = false;

import type { APIRoute } from 'astro';
import { prisma } from '../../../../../lib/db';
import { userHasRole } from '../../../../../lib/auth/session';
import { taskTypeConfig, completeTaskAndAdvanceProject } from '../../../../../lib/workflow';
import { notifyEverywhere, logActivity } from '../../../../../lib/notify';

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
    await notifyEverywhere(
      task.assignedToUserId!,
      'OTHER',
      `Changes requested on ${task.taskNumber}: ${note || 'Please review and resubmit.'}`,
      `/portal/employee/tasks/${taskId}`,
      `Changes requested on ${task.taskNumber} — Chance Publishers`,
    );
    await logActivity(task.projectId, `${task.taskNumber} sent back for changes`);
    return redirect(`/portal/admin/tasks/${taskId}`);
  }

  if (action === 'approve') {
    const config = taskTypeConfig(task.taskType);
    const latestDeliverable = task.fileAssets[0];
    const project = await prisma.bookProject.findUniqueOrThrow({ where: { id: task.projectId } });

    await notifyEverywhere(
      task.assignedToUserId!,
      'OTHER',
      `Your ${task.taskNumber} submission was approved. Great work!`,
      `/portal/employee/tasks/${taskId}`,
      `${task.taskNumber} approved — Chance Publishers`,
    );

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
      await notifyEverywhere(
        project.authorId,
        'APPROVAL_REQUIRED',
        `${config.approvalKind.replaceAll('_', ' ')} for "${project.title}" is ready for your review`,
        `/portal/author/projects/${task.projectId}`,
        `Action needed on "${project.title}" — Chance Publishers`,
      );
    } else {
      await completeTaskAndAdvanceProject(prisma, taskId);
      await notifyEverywhere(
        project.authorId,
        'OTHER',
        `Progress update on "${project.title}": ${config?.label || 'a task'} has been completed.`,
        `/portal/author/projects/${task.projectId}`,
        `Progress update on "${project.title}" — Chance Publishers`,
      );
    }
    await logActivity(task.projectId, `${task.taskNumber} approved`);
    return redirect(`/portal/admin/tasks/${taskId}`);
  }

  return redirect(`/portal/admin/tasks/${taskId}`);
};
