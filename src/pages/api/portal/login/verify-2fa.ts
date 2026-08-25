export const prerender = false;

import type { APIRoute } from 'astro';
import { prisma } from '../../../../lib/db';
import { createSession } from '../../../../lib/auth/session';
import { verifyTotp, consumeBackupCode } from '../../../../lib/auth/totp';
import { isRateLimited } from '../../../../lib/auth/rate-limit';

export const POST: APIRoute = async ({ request, cookies, redirect, clientAddress }) => {
  const challengeId = cookies.get('cp_2fa_challenge')?.value;
  const challenge = challengeId
    ? await prisma.twoFactorChallenge.findUnique({ where: { id: challengeId } })
    : null;

  if (!challenge || challenge.expiresAt < new Date()) {
    cookies.delete('cp_2fa_challenge', { path: '/' });
    return redirect('/portal/login');
  }

  if (await isRateLimited(`verify-2fa:${clientAddress}:${challenge.userId}`)) {
    return redirect('/portal/login/verify-2fa?error=invalid-code');
  }

  const data = await request.formData();
  const code = String(data.get('code') || '').trim();

  const user = await prisma.user.findUnique({ where: { id: challenge.userId } });
  if (!user || !user.totpEnabled || !user.totpSecret) {
    cookies.delete('cp_2fa_challenge', { path: '/' });
    return redirect('/portal/login');
  }

  const isTotpValid = verifyTotp(user.email, user.totpSecret, code);
  let remainingBackupCodes: string[] | null = null;
  if (!isTotpValid) {
    remainingBackupCodes = consumeBackupCode(user.totpBackupCodes, code);
  }

  if (!isTotpValid && remainingBackupCodes === null) {
    return redirect('/portal/login/verify-2fa?error=invalid-code');
  }

  if (remainingBackupCodes) {
    await prisma.user.update({ where: { id: user.id }, data: { totpBackupCodes: remainingBackupCodes } });
  }

  await prisma.twoFactorChallenge.delete({ where: { id: challenge.id } }).catch(() => {});
  cookies.delete('cp_2fa_challenge', { path: '/' });

  await createSession(user.id, cookies);
  return redirect(challenge.next.startsWith('/portal') ? challenge.next : '/portal');
};
