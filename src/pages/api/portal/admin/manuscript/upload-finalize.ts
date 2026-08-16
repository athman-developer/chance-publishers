export const prerender = false;

import type { APIRoute } from 'astro';
import { randomBytes } from 'node:crypto';
import { prisma } from '../../../../../lib/db';
import { getStorage } from '../../../../../lib/storage';
import { userHasRole } from '../../../../../lib/auth/session';
import { logActivity } from '../../../../../lib/notify';
import { DOCUMENT_TYPES, MAX_MANUSCRIPT_UPLOAD_BYTES } from '../../../../../lib/upload-validation';
import { assembleChunks, jsonResponse as json } from '../../../../../lib/chunked-upload';

export const POST: APIRoute = async ({ request, locals }) => {
  const user = locals.user;
  if (!user || !(userHasRole(user, 'ADMIN') || userHasRole(user, 'SUPER_ADMIN'))) {
    return json({ ok: false, error: 'unauthorized' }, 401);
  }

  const data = await request.formData();
  const projectId = String(data.get('projectId') || '');
  const uploadId = String(data.get('uploadId') || '');
  const totalChunks = Number(data.get('totalChunks'));
  const filename = String(data.get('filename') || 'manuscript').slice(0, 200);
  const contentType = String(data.get('contentType') || 'application/octet-stream');

  const project = await prisma.bookProject.findUnique({ where: { id: projectId }, include: { ndaAgreement: true } });
  if (!project) return json({ ok: false, error: 'not-found' }, 404);
  if (!DOCUMENT_TYPES.has(contentType)) return json({ ok: false, error: 'unsupported-file-type' }, 400);
  if (!Number.isInteger(totalChunks) || totalChunks < 1) return json({ ok: false, error: 'invalid-upload' }, 400);

  const assembled = await assembleChunks('manuscript-admin', user.id, uploadId, totalChunks, MAX_MANUSCRIPT_UPLOAD_BYTES);
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
    ...(existingCount === 0 && project.ndaAgreement?.status === 'EXECUTED'
      ? [prisma.bookProject.update({
          where: { id: projectId },
          data: { status: 'ACTIVE', currentStageKey: 'ADMIN_REVIEW', overallProgress: 15 },
        })]
      : []),
  ]);

  const ndaNote = project.ndaAgreement?.status === 'EXECUTED'
    ? ''
    : ' — held pending NDA execution, project stage will not advance yet';
  await logActivity(projectId, `Manuscript uploaded by admin on the client's behalf (v${existingCount + 1})${ndaNote}`);

  return json({ ok: true, redirect: `/portal/admin/projects/${projectId}?manuscript=submitted` });
};
