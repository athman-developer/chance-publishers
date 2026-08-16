export const prerender = false;

import type { APIRoute } from 'astro';
import { randomBytes } from 'node:crypto';
import { prisma } from '../../../../lib/db';
import { getStorage } from '../../../../lib/storage';
import { notifyAdmins, logActivity } from '../../../../lib/notify';
import { DOCUMENT_TYPES, MAX_MANUSCRIPT_UPLOAD_BYTES } from '../../../../lib/upload-validation';
import { assembleChunks, jsonResponse as json } from '../../../../lib/chunked-upload';

export const POST: APIRoute = async ({ request, locals }) => {
  const user = locals.user;
  if (!user) return json({ ok: false, error: 'unauthorized' }, 401);

  const data = await request.formData();
  const projectId = String(data.get('projectId') || '');
  const uploadId = String(data.get('uploadId') || '');
  const totalChunks = Number(data.get('totalChunks'));
  const filename = String(data.get('filename') || 'manuscript').slice(0, 200);
  const contentType = String(data.get('contentType') || 'application/octet-stream');

  const project = await prisma.bookProject.findUnique({ where: { id: projectId }, include: { ndaAgreement: true } });
  if (!project || project.authorId !== user.id) return json({ ok: false, error: 'not-found' }, 404);
  if (project.ndaAgreement?.status !== 'EXECUTED') return json({ ok: false, error: 'nda-not-executed' }, 400);
  if (!DOCUMENT_TYPES.has(contentType)) return json({ ok: false, error: 'unsupported-file-type' }, 400);
  if (!Number.isInteger(totalChunks) || totalChunks < 1) return json({ ok: false, error: 'invalid-upload' }, 400);

  const assembled = await assembleChunks('manuscript', user.id, uploadId, totalChunks, MAX_MANUSCRIPT_UPLOAD_BYTES);
  if (!assembled.ok) return json({ ok: false, error: assembled.error }, 400);

  const storage = await getStorage();
  const key = `manuscripts/${projectId}/${randomBytes(8).toString('hex')}-${filename}`;
  await storage.put(key, assembled.buffer, contentType);

  const existingCount = await prisma.fileAsset.count({ where: { projectId, kind: 'MANUSCRIPT' } });

  await prisma.$transaction([
    prisma.fileAsset.create({
      data: {
        projectId,
        kind: 'MANUSCRIPT',
        storageKey: key,
        originalFilename: filename,
        contentType,
        sizeBytes: assembled.buffer.length,
        uploadedByUserId: user.id,
        version: existingCount + 1,
      },
    }),
    prisma.bookProject.update({
      where: { id: projectId },
      data: { status: 'ACTIVE', currentStageKey: 'ADMIN_REVIEW', overallProgress: 15 },
    }),
  ]);

  await notifyAdmins('OTHER', `Manuscript submitted for "${project.title}"`, `/portal/admin/projects/${projectId}`);
  await logActivity(projectId, `Manuscript submitted (v${existingCount + 1})`);

  return json({ ok: true, redirect: `/portal/author/projects/${projectId}?manuscript=submitted` });
};
