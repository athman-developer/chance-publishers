export const prerender = false;

import type { APIRoute } from 'astro';
import { randomBytes, createHash } from 'node:crypto';
import { Resend } from 'resend';
import { prisma } from '../../../lib/db';
import { hashPassword } from '../../../lib/auth/password';
import { createSession } from '../../../lib/auth/session';

export const POST: APIRoute = async ({ request, cookies, redirect }) => {
  const data = await request.formData();
  const fullName = String(data.get('fullName') || '').trim();
  const email = String(data.get('email') || '').trim().toLowerCase();
  const phone = String(data.get('phone') || '').trim();
  const password = String(data.get('password') || '');

  if (!fullName || !email || password.length < 8) {
    return redirect('/portal/register?error=missing-fields');
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return redirect('/portal/register?error=email-taken');
  }

  const authorRole = await prisma.role.findUniqueOrThrow({ where: { key: 'AUTHOR' } });
  const passwordHash = await hashPassword(password);

  const user = await prisma.user.create({
    data: {
      email,
      phone: phone || null,
      passwordHash,
      status: 'ACTIVE',
      roles: { create: { roleId: authorRole.id } },
      authorProfile: { create: { fullLegalName: fullName } },
    },
  });

  // Email verification token
  const rawToken = randomBytes(32).toString('hex');
  const tokenHash = createHash('sha256').update(rawToken).digest('hex');
  await prisma.verificationToken.create({
    data: {
      userId: user.id,
      type: 'EMAIL_VERIFICATION',
      tokenHash,
      expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
    },
  });

  const apiKey = import.meta.env.RESEND_API_KEY;
  if (apiKey) {
    try {
      const resend = new Resend(apiKey);
      const verifyUrl = `${new URL(request.url).origin}/portal/verify-email?token=${rawToken}`;
      await resend.emails.send({
        from: 'Chance Publishers <manuscripts@chancepublishers.com>',
        to: email,
        subject: 'Verify your Chance Publishers Author Portal account',
        text: `Hello ${fullName},\n\nWelcome to the Chance Publishers Author Portal. Please verify your email address:\n\n${verifyUrl}\n\nThis link expires in 24 hours.\n\nChance Publishers`,
      });
    } catch (err) {
      console.error('register: failed to send verification email', err);
    }
  }

  await createSession(user.id, cookies);
  return redirect('/portal/author');
};
