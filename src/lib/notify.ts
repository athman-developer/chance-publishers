import { prisma } from './db';
import type { NotificationType } from '@prisma/client';

export async function notify(userId: string, type: NotificationType, message: string, link?: string) {
  await prisma.notification.create({ data: { userId, type, message, link } });
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
