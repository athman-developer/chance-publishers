export const prerender = false;

import type { APIRoute } from 'astro';
import { prisma } from '../../../../lib/db';
import { hashPassword, verifyPassword } from '../../../../lib/auth/password';

const SECTION_HOME: Record<string, string> = {
  ADMIN: '/portal/admin/settings',
  SUPER_ADMIN: '/portal/admin/settings',
  EMPLOYEE: '/portal/employee/settings',
  AUTHOR: '/portal/author/settings',
};

export const POST: APIRoute = async ({ request, locals, redirect }) => {
  const user = locals.user;
  if (!user) return redirect('/portal/login');

  const back = SECTION_HOME[user.roles?.[0]?.role?.key || ''] || '/portal/login';

  const data = await request.formData();
  const currentPassword = String(data.get('currentPassword') || '');
  const newPassword = String(data.get('newPassword') || '');
  const confirmPassword = String(data.get('confirmPassword') || '');

  if (newPassword.length < 8) return redirect(`${back}?pwError=too-short`);
  if (newPassword !== confirmPassword) return redirect(`${back}?pwError=mismatch`);

  const dbUser = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
  const valid = await verifyPassword(currentPassword, dbUser.passwordHash);
  if (!valid) return redirect(`${back}?pwError=wrong-current`);

  const passwordHash = await hashPassword(newPassword);
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash } });

  return redirect(`${back}?pwSuccess=1`);
};
