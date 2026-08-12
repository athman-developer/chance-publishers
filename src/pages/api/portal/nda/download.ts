export const prerender = false;

import type { APIRoute } from 'astro';
import { prisma } from '../../../../lib/db';
import { getStorage } from '../../../../lib/storage';
import { userHasRole } from '../../../../lib/auth/session';

export const GET: APIRoute = async ({ url, locals }) => {
  const user = locals.user;
  if (!user) return new Response('Unauthorized', { status: 401 });

  const ndaId = url.searchParams.get('ndaId') || '';
  const type = url.searchParams.get('type') === 'executed' ? 'executed' : 'unsigned';

  const nda = await prisma.ndaAgreement.findUnique({ where: { id: ndaId }, include: { project: true } });
  if (!nda) return new Response('Not found', { status: 404 });

  const isOwner = nda.project.authorId === user.id;
  const isAdmin = userHasRole(user, 'ADMIN') || userHasRole(user, 'SUPER_ADMIN');
  if (!isOwner && !isAdmin) return new Response('Forbidden', { status: 403 });

  const key = type === 'executed' ? nda.executedPdfKey : nda.generatedPdfKey;
  if (!key) return new Response('Not generated yet', { status: 404 });

  const storage = await getStorage();
  const file = await storage.get(key);
  if (!file) return new Response('File missing', { status: 404 });

  return new Response(file.data, {
    headers: {
      'Content-Type': file.contentType,
      'Content-Disposition': `inline; filename="${nda.ndaNumber}-${type}.pdf"`,
      'Cache-Control': 'private, no-store',
    },
  });
};
