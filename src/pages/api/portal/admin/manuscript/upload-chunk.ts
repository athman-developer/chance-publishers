export const prerender = false;

import type { APIRoute } from 'astro';
import { prisma } from '../../../../../lib/db';
import { userHasRole } from '../../../../../lib/auth/session';
import { chunkKey, validChunkParams, storeChunk, jsonResponse as json } from '../../../../../lib/chunked-upload';

export const POST: APIRoute = async ({ request, locals }) => {
  const user = locals.user;
  if (!user || !(userHasRole(user, 'ADMIN') || userHasRole(user, 'SUPER_ADMIN'))) {
    return json({ ok: false, error: 'unauthorized' }, 401);
  }

  const data = await request.formData();
  const projectId = String(data.get('projectId') || '');
  const uploadId = String(data.get('uploadId') || '');
  const chunkIndex = Number(data.get('chunkIndex'));
  const totalChunks = Number(data.get('totalChunks'));
  const chunk = data.get('chunk');

  const project = await prisma.bookProject.findUnique({ where: { id: projectId } });
  if (!project) return json({ ok: false, error: 'not-found' }, 404);
  if (!validChunkParams(uploadId, chunkIndex, totalChunks)) return json({ ok: false, error: 'invalid-chunk' }, 400);
  if (!(chunk instanceof File) || chunk.size === 0) return json({ ok: false, error: 'no-file' }, 400);

  await storeChunk(chunkKey('manuscript-admin', user.id, uploadId, chunkIndex), chunk);
  return json({ ok: true });
};
