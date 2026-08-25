export const prerender = false;

import type { APIRoute } from 'astro';
import { randomBytes, createHash } from 'node:crypto';
import { Resend } from 'resend';
import { prisma } from '../../../lib/db';
import { isRateLimited } from '../../../lib/auth/rate-limit';

export const POST: APIRoute = async ({ request, redirect, clientAddress }) => {
  const data = await request.formData();
  const email = String(data.get('email') || '').trim().toLowerCase();

  // Rate-limited per IP+email, same as login — this endpoint sends real
  // emails and must not be usable to spam a stranger's inbox.
  if (await isRateLimited(`forgot-password:${clientAddress}:${email}`)) {
    return redirect('/portal/forgot-password?sent=1');
  }

  const user = email ? await prisma.user.findUnique({ where: { email } }) : null;

  // Always respond the same way whether or not the account exists, so this
  // endpoint can't be used to check which emails are registered.
  if (user) {
    const rawToken = randomBytes(32).toString('hex');
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');
    await prisma.verificationToken.create({
      data: {
        userId: user.id,
        type: 'PASSWORD_RESET',
        tokenHash,
        expiresAt: new Date(Date.now() + 1000 * 60 * 60), // 1 hour
      },
    });

    const apiKey = import.meta.env.RESEND_API_KEY;
    if (apiKey) {
      try {
        const resend = new Resend(apiKey);
        const resetUrl = `${new URL(request.url).origin}/portal/reset-password?token=${rawToken}`;
        await resend.emails.send({
          from: 'Chance Publishers <manuscripts@chancepublishers.com>',
          to: email,
          subject: 'Reset your Chance Publishers Portal password',
          text: `Hello,\n\nWe received a request to reset your Chance Publishers Portal password. Reset it here:\n\n${resetUrl}\n\nThis link expires in 1 hour. If you didn't request this, you can safely ignore this email — your password will stay unchanged.\n\nChance Publishers`,
        });
      } catch (err) {
        console.error('forgot-password: failed to send reset email', err);
      }
    }
  }

  return redirect('/portal/forgot-password?sent=1');
};
