export const prerender = false;

import type { APIRoute } from 'astro';
import { randomBytes } from 'node:crypto';
import { Resend } from 'resend';
import { prisma } from '../../../../../lib/db';
import { hashPassword } from '../../../../../lib/auth/password';
import { sendSms, normalizeKenyanPhone } from '../../../../../lib/sms';
import { userHasRole } from '../../../../../lib/auth/session';

function generatePassword(): string {
  return randomBytes(9).toString('base64url');
}

export const POST: APIRoute = async ({ request, locals, redirect }) => {
  const admin = locals.user;
  if (!admin || !(userHasRole(admin, 'ADMIN') || userHasRole(admin, 'SUPER_ADMIN'))) {
    return redirect('/portal/login');
  }

  const data = await request.formData();
  const fullName = String(data.get('fullName') || '').trim();
  const email = String(data.get('email') || '').trim().toLowerCase();
  const phone = String(data.get('phone') || '').trim();
  const jobTitle = String(data.get('jobTitle') || '').trim();
  const designation = String(data.get('designation') || 'INTERNAL');

  if (!fullName || !email) {
    return redirect('/portal/admin/team?error=missing-fields');
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return redirect('/portal/admin/team?error=email-taken');
  }

  const employeeRole = await prisma.role.findUniqueOrThrow({ where: { key: 'EMPLOYEE' } });
  const password = generatePassword();
  const passwordHash = await hashPassword(password);
  const staffId = `CP-${randomBytes(3).toString('hex').toUpperCase()}`;

  await prisma.user.create({
    data: {
      email,
      phone: phone || null,
      passwordHash,
      status: 'ACTIVE',
      emailVerified: true,
      roles: { create: { roleId: employeeRole.id } },
      employeeProfile: {
        create: {
          staffId,
          fullName,
          jobTitle: jobTitle || null,
          designation: designation === 'EXTERNAL' ? 'EXTERNAL' : 'INTERNAL',
        },
      },
    },
  });

  const loginUrl = `${new URL(request.url).origin}/portal/login`;
  const firstName = fullName.split(' ')[0];
  const smsMessage = `Congratulations ${firstName}! You've joined the Chance Publishers team${jobTitle ? ` as ${jobTitle}` : ''}. Sign in at ${loginUrl}\nEmail: ${email}\nTemporary password: ${password}\nPlease change it after logging in.`;

  const sentChannels: string[] = [];

  const apiKey = import.meta.env.RESEND_API_KEY;
  if (apiKey) {
    try {
      const resend = new Resend(apiKey);
      await resend.emails.send({
        from: 'Chance Publishers <manuscripts@chancepublishers.com>',
        to: email,
        subject: 'Welcome to the Chance Publishers team! 🎉',
        html: `
          <div style="font-family:Georgia,serif;max-width:520px;margin:0 auto;padding:32px 28px;background:#f7f9f6;border-radius:16px">
            <p style="font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:#2f6b3e;font-weight:700;margin:0 0 8px">Welcome aboard</p>
            <h1 style="font-size:26px;color:#173c22;margin:0 0 18px">Congratulations, ${fullName}! 🎉</h1>
            <p style="font-size:15px;line-height:1.6;color:#3a3a3a">
              You've officially joined <strong>Chance Publishers</strong>${jobTitle ? ` as our <strong>${jobTitle}</strong>` : ''}.
              We're excited to have you on the team, helping authors bring their books to life.
            </p>
            <div style="background:#ffffff;border:1px solid #e2e8dd;border-radius:12px;padding:20px 22px;margin:22px 0">
              <p style="margin:0 0 10px;font-size:14px;color:#555"><strong>Your login details</strong></p>
              <p style="margin:0 0 6px;font-size:15px;color:#173c22">Email: <strong>${email}</strong></p>
              <p style="margin:0;font-size:15px;color:#173c22">Temporary password: <strong>${password}</strong></p>
            </div>
            <a href="${loginUrl}" style="display:inline-block;background:#2f6b3e;color:#fff;text-decoration:none;font-weight:700;padding:12px 26px;border-radius:9px;font-size:15px">Sign in to your account →</a>
            <p style="font-size:13px;color:#777;margin-top:22px">For security, please change your password as soon as you log in.</p>
            <p style="font-size:14px;color:#3a3a3a;margin-top:26px">Welcome to the team!<br/>— Chance Publishers</p>
          </div>
        `,
      });
      sentChannels.push('email');
    } catch (err) {
      console.error('team/create: failed to send welcome email', err);
    }
  }

  const normalizedPhone = phone ? normalizeKenyanPhone(phone) : null;
  if (normalizedPhone) {
    const smsResult = await sendSms(normalizedPhone, smsMessage);
    if (smsResult.ok) sentChannels.push('sms');
  }

  return redirect(`/portal/admin/team?created=1&sent=${sentChannels.join(',') || 'none'}`);
};
