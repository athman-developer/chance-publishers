import { prisma } from './db';
import type { NotificationType } from '@prisma/client';
import { sendSms } from './sms';
import { sendEmail } from './email';
import { sendWhatsAppMessage } from './whatsapp';

export async function notify(userId: string, type: NotificationType, message: string, link?: string) {
  await prisma.notification.create({ data: { userId, type, message, link } });
}

// In-app notification plus real-world channels (email always; WhatsApp/SMS
// only if the user has a phone on file) — for events someone needs to
// actually see promptly (task approved/rejected), not just log into the
// portal to eventually notice.
export async function notifyEverywhere(
  userId: string,
  type: NotificationType,
  message: string,
  link: string | undefined,
  subject: string,
) {
  await notify(userId, type, message, link);
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return;
  if (user.phone) {
    await sendWhatsAppMessage(user.phone, message).catch(() => {});
    await sendSms(user.phone, message).catch(() => {});
  }
  if (user.email) {
    await sendEmail(user.email, subject, message).catch(() => {});
  }
}

export async function notifyAdmins(type: NotificationType, message: string, link?: string) {
  const admins = await prisma.userRole.findMany({
    where: { role: { key: { in: ['ADMIN', 'SUPER_ADMIN'] } } },
    select: { userId: true },
  });
  await prisma.notification.createMany({
    data: admins.map((a) => ({ userId: a.userId, type, message, link })),
  });
}

export async function logActivity(projectId: string, message: string) {
  await prisma.activityEvent.create({ data: { projectId, message } });
}
