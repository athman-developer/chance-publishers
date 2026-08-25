export const prerender = false;

import type { APIRoute } from 'astro';
import { createHash } from 'node:crypto';
import { prisma } from '../../../lib/db';
import { hashPassword } from '../../../lib/auth/password';

export const POST: APIRoute = async ({ request, redirect }) => {
  const data = await request.formData();
  const token = String(data.get('token') || '');
  const newPassword = String(data.get('newPassword') || '');
  const confirmPassword = String(data.get('confirmPassword') || '');

  const backTo = `/portal/reset-password?token=${encodeURIComponent(token)}`;

  if (newPassword.length < 8) return redirect(`${backTo}&error=too-short`);
  if (newPassword !== confirmPassword) return redirect(`${backTo}&error=mismatch`);

  const tokenHash = createHash('sha256').update(token).digest('hex');
  const record = await prisma.verificationToken.findUnique({ where: { tokenHash } });
  if (!record || record.type !== 'PASSWORD_RESET' || record.usedAt || record.expiresAt < new Date()) {
    return redirect('/portal/reset-password');
  }

  const passwordHash = await hashPassword(newPassword);

  await prisma.$transaction([
    prisma.user.update({ where: { id: record.userId }, data: { passwordHash } }),
    prisma.verificationToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
    // Sign the account out everywhere — a password reset should invalidate
    // any session that might exist on another device.
    prisma.session.deleteMany({ where: { userId: record.userId } }),
  ]);

  return redirect('/portal/login?reset=1');
};
