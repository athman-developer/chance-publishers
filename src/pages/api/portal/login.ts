export const prerender = false;

import type { APIRoute } from 'astro';
import { prisma } from '../../../lib/db';
import { verifyPassword } from '../../../lib/auth/password';
import { createSession } from '../../../lib/auth/session';
import { isRateLimited, resetRateLimit } from '../../../lib/auth/rate-limit';

export const POST: APIRoute = async ({ request, cookies, redirect, clientAddress }) => {
  const data = await request.formData();
  const email = String(data.get('email') || '').trim().toLowerCase();
  const password = String(data.get('password') || '');
  const next = String(data.get('next') || '/portal');

  const rateLimitKey = `${clientAddress}:${email}`;
  if (isRateLimited(rateLimitKey)) {
    return redirect('/portal/login?error=rate-limited');
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return redirect('/portal/login?error=invalid-credentials');

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) return redirect('/portal/login?error=invalid-credentials');

  if (user.status !== 'ACTIVE') {
    return redirect('/portal/login?error=account-inactive');
  }

  resetRateLimit(rateLimitKey);
  await createSession(user.id, cookies);
  return redirect(next.startsWith('/portal') ? next : '/portal');
};
