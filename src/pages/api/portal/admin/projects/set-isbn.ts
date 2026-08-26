export const prerender = false;

import type { APIRoute } from 'astro';
import { prisma } from '../../../../../lib/db';
import { userHasRole } from '../../../../../lib/auth/session';
import { logActivity } from '../../../../../lib/notify';

export const POST: APIRoute = async ({ request, locals, redirect }) => {
  const user = locals.user;
  if (!user || !(userHasRole(user, 'ADMIN') || userHasRole(user, 'SUPER_ADMIN'))) {
    return redirect('/portal/login');
  }

  const data = await request.formData();
  const projectId = String(data.get('projectId') || '');
  const isbn = String(data.get('isbn') || '').trim();

  const project = await prisma.bookProject.findUnique({ where: { id: projectId } });
  if (!project) return redirect('/portal/admin');

  await prisma.bookProject.update({
    where: { id: projectId },
    data: { isbn: isbn || null, isbnAssignedAt: isbn ? new Date() : null },
  });

  if (isbn) await logActivity(projectId, `ISBN ${isbn} recorded`);

  return redirect(`/portal/admin/projects/${projectId}`);
};
