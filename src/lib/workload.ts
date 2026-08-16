import { prisma } from './db';

const ACTIVE_STATUSES = ['ASSIGNED', 'ACCEPTED', 'IN_PROGRESS', 'SUBMITTED_FOR_REVIEW', 'CHANGES_REQUESTED'] as const;

export async function listAssignableEmployees() {
  const employees = await prisma.user.findMany({
    where: { roles: { some: { role: { key: { in: ['EMPLOYEE', 'PARTNER'] } } } } },
    include: { employeeProfile: true, partnerProfile: true },
  });

  const weekFromNow = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const now = new Date();

  const withWorkload = await Promise.all(
    employees.map(async (user) => {
      const activeTasks = await prisma.task.findMany({
        where: { assignedToUserId: user.id, status: { in: [...ACTIVE_STATUSES] } },
        select: { dueDate: true },
      });
      const activeCount = activeTasks.length;
      const dueThisWeek = activeTasks.filter((t) => t.dueDate && t.dueDate <= weekFromNow && t.dueDate >= now).length;
      const overdue = activeTasks.filter((t) => t.dueDate && t.dueDate < now).length;
      const workloadLabel = activeCount === 0 ? 'AVAILABLE' : activeCount <= 3 ? 'AVAILABLE' : activeCount <= 6 ? 'MODERATELY BUSY' : 'HIGH WORKLOAD';

      return {
        id: user.id,
        name: user.employeeProfile
          ? `${user.employeeProfile.fullName || user.email}${user.employeeProfile.jobTitle ? ` — ${user.employeeProfile.jobTitle}` : ''}`
          : user.partnerProfile?.contactPerson || user.email,
        email: user.email,
        activeCount,
        dueThisWeek,
        overdue,
        workloadLabel,
      };
    }),
  );

  return withWorkload;
}
