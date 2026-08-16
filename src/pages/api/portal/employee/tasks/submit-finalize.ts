export const prerender = false;

import type { APIRoute } from 'astro';
import { randomBytes } from 'node:crypto';
import { prisma } from '../../../../../lib/db';
import { getStorage } from '../../../../../lib/storage';
import { taskTypeConfig } from '../../../../../lib/workflow';
import { PROOF_TYPES } from '../../../../../lib/upload-validation';

export const MAX_CHUNKED_UPLOAD_BYTES = 20 * 1024 * 1024; // 20MB

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

export const POST: APIRoute = async ({ request, locals }) => {
  const user = locals.user;
  if (!user) return json({ ok: false, error: 'unauthorized' }, 401);

  const data = await request.formData();
  const taskId = String(data.get('taskId') || '');
  const uploadId = String(data.get('uploadId') || '');
  const totalChunks = Number(data.get('totalChunks'));
  const filename = String(data.get('filename') || 'upload').slice(0, 200);
  const contentType = String(data.get('contentType') || 'application/octet-stream');

  const task = await prisma.task.findUnique({ where: { id: taskId }, include: { fileAssets: true } });
  if (!task || task.assignedToUserId !== user.id) return json({ ok: false, error: 'not-found' }, 404);
  if (!['ACCEPTED', 'IN_PROGRESS', 'CHANGES_REQUESTED'].includes(task.status)) {
    return json({ ok: false, error: 'wrong-status' }, 400);
  }
  if (!PROOF_TYPES.has(contentType)) return json({ ok: false, error: 'unsupported-file-type' }, 400);

  const validId = /^[a-zA-Z0-9-]{1,64}$/.test(uploadId);
  if (!validId || !Number.isInteger(totalChunks) || totalChunks < 1) {
    return json({ ok: false, error: 'invalid-upload' }, 400);
  }

  const storage = await getStorage();
  const chunkKeys: string[] = [];
  const parts: Buffer[] = [];
  let totalSize = 0;

  for (let i = 0; i < totalChunks; i++) {
    const key = `_chunks/${user.id}/${uploadId}/${i}`;
    const result = await storage.get(key);
    if (!result) return json({ ok: false, error: 'missing-chunk' }, 400);
    parts.push(result.data);
    totalSize += result.data.length;
    chunkKeys.push(key);
  }

  if (totalSize === 0 || totalSize > MAX_CHUNKED_UPLOAD_BYTES) {
    await Promise.all(chunkKeys.map((k) => storage.delete(k)));
    return json({ ok: false, error: 'file-too-large' }, 400);
  }

  const buffer = Buffer.concat(parts);
  const config = taskTypeConfig(task.taskType);
  const key = `deliverables/${task.projectId}/${task.id}/${randomBytes(8).toString('hex')}-${filename}`;
  await storage.put(key, buffer, contentType);

  await prisma.$transaction([
    prisma.fileAsset.create({
      data: {
        projectId: task.projectId,
        taskId: task.id,
        kind: (config?.deliverableKind as any) || 'OTHER',
        storageKey: key,
        originalFilename: filename,
        contentType,
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

  await Promise.all(chunkKeys.map((k) => storage.delete(k)));

  return json({ ok: true, redirect: `/portal/employee/tasks/${taskId}` });
};
