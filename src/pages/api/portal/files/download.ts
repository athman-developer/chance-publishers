export const prerender = false;

import type { APIRoute } from 'astro';
import { prisma } from '../../../../lib/db';
import { getStorage } from '../../../../lib/storage';
import { userHasRole } from '../../../../lib/auth/session';

export const GET: APIRoute = async ({ url, locals }) => {
  const user = locals.user;
  if (!user) return new Response('Unauthorized', { status: 401 });

  const fileId = url.searchParams.get('fileId') || '';
  const file = await prisma.fileAsset.findUnique({
    where: { id: fileId },
    include: { project: true, task: true },
  });
  if (!file) return new Response('Not found', { status: 404 });

  const isAdmin = userHasRole(user, 'ADMIN') || userHasRole(user, 'SUPER_ADMIN');
  const isProjectAuthor = file.project?.authorId === user.id;
  const isAssignedEmployee = file.task?.assignedToUserId === user.id;
  if (!isAdmin && !isProjectAuthor && !isAssignedEmployee) {
    return new Response('Forbidden', { status: 403 });
  }

  const storage = await getStorage();
  const stored = await storage.get(file.storageKey);
  if (!stored) return new Response('File missing', { status: 404 });

  return new Response(stored.data, {
    headers: {
      'Content-Type': stored.contentType,
      'Content-Disposition': `inline; filename="${file.originalFilename}"`,
      'Cache-Control': 'private, no-store',
    },
  });
};
