export const prerender = false;

import type { APIRoute } from 'astro';
import { prisma } from '../../../../lib/db';
import { getStorage } from '../../../../lib/storage';
import { userHasRole } from '../../../../lib/auth/session';

export const GET: APIRoute = async ({ url, locals }) => {
  const user = locals.user;
  if (!user) return new Response('Unauthorized', { status: 401 });

  const paymentId = url.searchParams.get('paymentId') || '';
  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    include: { invoice: { include: { project: true } } },
  });
  if (!payment || !payment.proofFileKey) return new Response('Not found', { status: 404 });

  const isOwner = payment.invoice.project.authorId === user.id;
  const isAdmin = userHasRole(user, 'ADMIN') || userHasRole(user, 'SUPER_ADMIN');
  if (!isOwner && !isAdmin) return new Response('Forbidden', { status: 403 });

  const storage = await getStorage();
  const file = await storage.get(payment.proofFileKey);
  if (!file) return new Response('File missing', { status: 404 });

  return new Response(file.data, {
    headers: { 'Content-Type': file.contentType, 'Cache-Control': 'private, no-store' },
  });
};
