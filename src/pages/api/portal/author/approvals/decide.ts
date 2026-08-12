export const prerender = false;

import type { APIRoute } from 'astro';
import { prisma } from '../../../../../lib/db';
import { completeTaskAndAdvanceProject } from '../../../../../lib/workflow';
import { notifyAdmins, logActivity } from '../../../../../lib/notify';

export const POST: APIRoute = async ({ request, locals, redirect }) => {
  const user = locals.user;
  if (!user) return redirect('/portal/login');

  const data = await request.formData();
  const approvalId = String(data.get('approvalId') || '');
  const action = String(data.get('action') || '');
  const note = String(data.get('note') || '').trim();

  const approval = await prisma.approval.findUnique({
    where: { id: approvalId },
    include: { project: true, task: true },
  });
  if (!approval || approval.project.authorId !== user.id || approval.status !== 'PENDING') {
    return redirect('/portal/author');
  }

  if (action === 'approve') {
    await prisma.approval.update({
      where: { id: approvalId },
      data: { status: 'APPROVED', decidedAt: new Date() },
    });
    if (approval.taskId) await completeTaskAndAdvanceProject(prisma, approval.taskId);
    await notifyAdmins('APPROVAL_DECIDED', `${approval.kind.replaceAll('_', ' ')} approved by the author`, `/portal/admin/projects/${approval.projectId}`);
    await logActivity(approval.projectId, `Author approved ${approval.kind.replaceAll('_', ' ')}`);
  } else if (action === 'request-changes') {
    await prisma.$transaction([
      prisma.approval.update({
        where: { id: approvalId },
        data: { status: 'CHANGES_REQUESTED', decidedAt: new Date(), changeRequestNote: note || null },
      }),
      ...(approval.taskId
        ? [prisma.task.update({
            where: { id: approval.taskId },
            data: { status: 'CHANGES_REQUESTED', changeRequestNote: note || 'The author requested changes.' },
          })]
        : []),
    ]);
    await notifyAdmins('APPROVAL_DECIDED', `Author requested changes on ${approval.kind.replaceAll('_', ' ')}`, `/portal/admin/projects/${approval.projectId}`);
    await logActivity(approval.projectId, `Author requested changes on ${approval.kind.replaceAll('_', ' ')}`);
  }

  return redirect(`/portal/author/projects/${approval.projectId}`);
};
