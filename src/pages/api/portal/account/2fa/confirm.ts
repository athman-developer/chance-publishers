export const prerender = false;

import type { APIRoute } from 'astro';
import { prisma } from '../../../../../lib/db';
import { verifyTotp, generateBackupCodes } from '../../../../../lib/auth/totp';

export const POST: APIRoute = async ({ request, cookies, locals, redirect }) => {
  const user = locals.user;
  if (!user) return redirect('/portal/login');

  const dbUser = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
  if (!dbUser.totpSecret) return redirect('/portal/account/2fa');

  const data = await request.formData();
  const code = String(data.get('code') || '');

  if (!verifyTotp(dbUser.email, dbUser.totpSecret, code)) {
    return redirect('/portal/account/2fa?error=invalid-code');
  }

  const { plain, hashed } = generateBackupCodes();
  await prisma.user.update({
    where: { id: user.id },
    data: { totpEnabled: true, totpBackupCodes: hashed },
  });

  // One-time, short-lived, httpOnly — read once by backup-codes.astro then
  // deleted immediately, so the plaintext codes never persist anywhere
  // retrievable after this single view.
  cookies.set('cp_2fa_new_codes', JSON.stringify(plain), {
    path: '/',
    httpOnly: true,
    secure: import.meta.env.PROD,
    sameSite: 'lax',
    maxAge: 60,
  });

  return redirect('/portal/account/2fa/backup-codes');
};
