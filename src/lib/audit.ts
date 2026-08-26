import { prisma } from './db';

// Admin-only accountability log for sensitive money/account actions — see
// AdminAuditLog in schema.prisma for why this is separate from the
// per-project ActivityEvent authors can see.
export async function logAdminAction(
  actorUserId: string,
  action: string,
  targetType: string,
  targetId?: string,
  detail?: string,
) {
  const actor = await prisma.user.findUnique({ where: { id: actorUserId } });
  await prisma.adminAuditLog.create({
    data: {
      actorUserId: actor ? actorUserId : null,
      actorLabel: actor ? actor.email : actorUserId,
      action,
      targetType,
      targetId,
      detail,
    },
  });
}
