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
  if (await isRateLimited(rateLimitKey)) {
    return redirect('/portal/login?error=rate-limited');
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return redirect('/portal/login?error=invalid-credentials');

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) return redirect('/portal/login?error=invalid-credentials');

  if (user.status !== 'ACTIVE') {
    return redirect('/portal/login?error=account-inactive');
  }

  await resetRateLimit(rateLimitKey);

  const safeNext = next.startsWith('/portal') ? next : '/portal';

  if (user.totpEnabled) {
    const challenge = await prisma.twoFactorChallenge.create({
      data: { userId: user.id, next: safeNext, expiresAt: new Date(Date.now() + 1000 * 60 * 10) },
    });
    cookies.set('cp_2fa_challenge', challenge.id, {
      path: '/',
      httpOnly: true,
      secure: import.meta.env.PROD,
      sameSite: 'lax',
      maxAge: 60 * 10,
    });
    return redirect('/portal/login/verify-2fa');
  }

  await createSession(user.id, cookies);
  return redirect(safeNext);
};
