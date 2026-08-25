export const prerender = false;

import type { APIRoute } from 'astro';
import { prisma } from '../../../../../lib/db';
import { generateSecret } from '../../../../../lib/auth/totp';

export const POST: APIRoute = async ({ locals, redirect }) => {
  const user = locals.user;
  if (!user) return redirect('/portal/login');

  const dbUser = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
  if (dbUser.totpEnabled) return redirect('/portal/account/2fa');

  const secret = generateSecret();
  await prisma.user.update({ where: { id: user.id }, data: { totpSecret: secret.base32 } });

  return redirect('/portal/account/2fa');
};
