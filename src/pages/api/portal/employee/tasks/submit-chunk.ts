export const prerender = false;

import type { APIRoute } from 'astro';
import { prisma } from '../../../../../lib/db';
import { getStorage } from '../../../../../lib/storage';

// 4MB per chunk keeps each request safely under Netlify Functions' ~6MB
// hard body ceiling; 6 chunks gives headroom for a 20MB file after overhead.
const MAX_CHUNKS = 6;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

export const POST: APIRoute = async ({ request, locals }) => {
  const user = locals.user;
  if (!user) return json({ ok: false, error: 'unauthorized' }, 401);

  const data = await request.formData();
  const taskId = String(data.get('taskId') || '');
  const uploadId = String(data.get('uploadId') || '');
  const chunkIndex = Number(data.get('chunkIndex'));
  const totalChunks = Number(data.get('totalChunks'));
  const chunk = data.get('chunk');

  const task = await prisma.task.findUnique({ where: { id: taskId } });
  if (!task || task.assignedToUserId !== user.id) return json({ ok: false, error: 'not-found' }, 404);

  const validId = /^[a-zA-Z0-9-]{1,64}$/.test(uploadId);
  if (!validId || !Number.isInteger(chunkIndex) || !Number.isInteger(totalChunks) ||
      totalChunks < 1 || totalChunks > MAX_CHUNKS || chunkIndex < 0 || chunkIndex >= totalChunks) {
    return json({ ok: false, error: 'invalid-chunk' }, 400);
  }
  if (!(chunk instanceof File) || chunk.size === 0) return json({ ok: false, error: 'no-file' }, 400);

  const storage = await getStorage();
  const buffer = Buffer.from(await chunk.arrayBuffer());
  await storage.put(`_chunks/${user.id}/${uploadId}/${chunkIndex}`, buffer, 'application/octet-stream');

  return json({ ok: true });
};
