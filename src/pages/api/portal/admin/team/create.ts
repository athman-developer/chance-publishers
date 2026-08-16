export const prerender = false;

import type { APIRoute } from 'astro';
import { randomBytes } from 'node:crypto';
import { prisma } from '../../../../../lib/db';
import { hashPassword } from '../../../../../lib/auth/password';
import { sendEmail } from '../../../../../lib/email';
import { sendSms, normalizeKenyanPhone } from '../../../../../lib/sms';

function generatePassword(): string {
  return randomBytes(9).toString('base64url');
}

export const POST: APIRoute = async ({ request, locals, redirect }) => {
  const admin = locals.user;
  if (!admin) return redirect('/portal/login');

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
          jobTitle: jobTitle || null,
          designation: designation === 'EXTERNAL' ? 'EXTERNAL' : 'INTERNAL',
        },
      },
    },
  });

  const loginUrl = `${new URL(request.url).origin}/portal/login`;
  const message = `Hello ${fullName}, you've been added as staff at Chance Publishers. Sign in at ${loginUrl}\n\nEmail: ${email}\nTemporary password: ${password}\n\nPlease change your password after logging in.`;

  const sentChannels: string[] = [];
  const emailResult = await sendEmail(email, 'Your Chance Publishers staff account', message);
  if (emailResult.ok) sentChannels.push('email');

  const normalizedPhone = phone ? normalizeKenyanPhone(phone) : null;
  if (normalizedPhone) {
    const smsResult = await sendSms(normalizedPhone, message);
    if (smsResult.ok) sentChannels.push('sms');
  }

  return redirect(`/portal/admin/team?created=1&sent=${sentChannels.join(',') || 'none'}`);
};
