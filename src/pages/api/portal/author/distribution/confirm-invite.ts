export const prerender = false;

import type { APIRoute } from 'astro';
import { prisma } from '../../../../../lib/db';
import { notifyAdminsEverywhere, logActivity } from '../../../../../lib/notify';

export const POST: APIRoute = async ({ request, locals, redirect }) => {
  const user = locals.user;
  if (!user) return redirect('/portal/login');

  const data = await request.formData();
  const projectId = String(data.get('projectId') || '');
  const platformRaw = String(data.get('platform') || '');
  const platform = platformRaw === 'GOOGLE_PLAY_BOOKS' ? 'GOOGLE_PLAY_BOOKS' : 'AMAZON_KDP';

  const project = await prisma.bookProject.findUnique({ where: { id: projectId } });
  if (!project || project.authorId !== user.id) return redirect('/portal/author');

  await prisma.distributionListing.upsert({
    where: { projectId_platform: { projectId, platform } },
    update: { status: 'AUTHOR_INVITED_ADMIN' },
    create: { projectId, platform, status: 'AUTHOR_INVITED_ADMIN' },
  });

  await logActivity(projectId, `Author invited our team as an authorized ${platform.replaceAll('_', ' ')} user`);
  await notifyAdminsEverywhere(
    'OTHER',
    `${project.title}: the author has invited us to their ${platform.replaceAll('_', ' ')} account — please accept and confirm access.`,
    `/portal/admin/projects/${projectId}`,
    'Distribution invite received — Chance Publishers',
  );

  return redirect(`/portal/author/projects/${projectId}/distribution?confirmed=1`);
};
