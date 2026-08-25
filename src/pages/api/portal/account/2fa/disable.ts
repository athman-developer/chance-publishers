export const prerender = false;

import type { APIRoute } from 'astro';
import { prisma } from '../../../../../lib/db';
import { verifyPassword } from '../../../../../lib/auth/password';

export const POST: APIRoute = async ({ request, locals, redirect }) => {
  const user = locals.user;
  if (!user) return redirect('/portal/login');

  const data = await request.formData();
  const currentPassword = String(data.get('currentPassword') || '');

  const dbUser = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
  const valid = await verifyPassword(currentPassword, dbUser.passwordHash);
  if (!valid) return redirect('/portal/account/2fa?error=wrong-password');

  await prisma.user.update({
    where: { id: user.id },
    data: { totpEnabled: false, totpSecret: null, totpBackupCodes: [] },
  });

  return redirect('/portal/account/2fa');
};
