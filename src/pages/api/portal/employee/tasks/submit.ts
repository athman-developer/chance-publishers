export const prerender = false;

import type { APIRoute } from 'astro';
import { randomBytes } from 'node:crypto';
import { prisma } from '../../../../../lib/db';
import { getStorage } from '../../../../../lib/storage';
import { taskTypeConfig } from '../../../../../lib/workflow';
import { validateUpload, PROOF_TYPES } from '../../../../../lib/upload-validation';

export const POST: APIRoute = async ({ request, locals, redirect }) => {
  const user = locals.user;
  if (!user) return redirect('/portal/login');

  const data = await request.formData();
  const taskId = String(data.get('taskId') || '');
  const file = data.get('deliverable');

  const task = await prisma.task.findUnique({ where: { id: taskId }, include: { fileAssets: true } });
  if (!task || task.assignedToUserId !== user.id) return redirect('/portal/employee');
  if (!['ACCEPTED', 'IN_PROGRESS', 'CHANGES_REQUESTED'].includes(task.status)) {
    return redirect(`/portal/employee/tasks/${taskId}`);
  }
  const validated = validateUpload(file, PROOF_TYPES);
  if (!validated.ok) {
    return redirect(`/portal/employee/tasks/${taskId}?error=${validated.error}`);
  }

  const config = taskTypeConfig(task.taskType);
  const storage = await getStorage();
  const buffer = Buffer.from(await validated.file.arrayBuffer());
  const key = `deliverables/${task.projectId}/${task.id}/${randomBytes(8).toString('hex')}-${validated.file.name}`;
  await storage.put(key, buffer, validated.file.type);

  await prisma.$transaction([
    prisma.fileAsset.create({
      data: {
        projectId: task.projectId,
        taskId: task.id,
        kind: (config?.deliverableKind as any) || 'OTHER',
        storageKey: key,
        originalFilename: validated.file.name,
        contentType: validated.file.type,
        sizeBytes: buffer.length,
        uploadedByUserId: user.id,
        version: task.fileAssets.length + 1,
      },
    }),
    prisma.task.update({
      where: { id: taskId },
      data: { status: 'SUBMITTED_FOR_REVIEW', submittedAt: new Date(), changeRequestNote: null },
    }),
  ]);

  return redirect(`/portal/employee/tasks/${taskId}`);
};
