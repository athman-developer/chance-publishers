export const prerender = false;

import type { APIRoute } from 'astro';
import { prisma } from '../../../../../lib/db';
import { userHasRole } from '../../../../../lib/auth/session';
import { notifyEverywhere, logActivity } from '../../../../../lib/notify';

const VALID_STATUSES = new Set(['NOT_STARTED', 'AUTHOR_INVITED_ADMIN', 'ADMIN_ACCESS_CONFIRMED', 'UPLOADED', 'LIVE']);

export const POST: APIRoute = async ({ request, locals, redirect }) => {
  const admin = locals.user;
  if (!admin || !(userHasRole(admin, 'ADMIN') || userHasRole(admin, 'SUPER_ADMIN'))) {
    return redirect('/portal/login');
  }

  const data = await request.formData();
  const projectId = String(data.get('projectId') || '');
  const platformRaw = String(data.get('platform') || '');
  const platform = platformRaw === 'GOOGLE_PLAY_BOOKS' ? 'GOOGLE_PLAY_BOOKS' : 'AMAZON_KDP';
  const statusRaw = String(data.get('status') || '');
  const status = VALID_STATUSES.has(statusRaw) ? statusRaw : 'NOT_STARTED';
  const listingUrl = String(data.get('listingUrl') || '').trim();
  const asin = String(data.get('asin') || '').trim();
  const notes = String(data.get('notes') || '').trim();

  const project = await prisma.bookProject.findUnique({ where: { id: projectId } });
  if (!project) return redirect('/portal/admin');

  await prisma.distributionListing.upsert({
    where: { projectId_platform: { projectId, platform } },
    update: {
      status: status as any,
      listingUrl: listingUrl || null,
      asin: asin || null,
      notes: notes || null,
    },
    create: {
      projectId,
      platform,
      status: status as any,
      listingUrl: listingUrl || null,
      asin: asin || null,
      notes: notes || null,
    },
  });

  await logActivity(projectId, `${platform.replaceAll('_', ' ')} distribution status updated to ${status.replaceAll('_', ' ')}`);

  if (status === 'LIVE' || status === 'UPLOADED') {
    await notifyEverywhere(
      project.authorId,
      'OTHER',
      `Great news — "${project.title}" is ${status === 'LIVE' ? 'now live on Amazon' : 'uploaded to Amazon and awaiting review'}.${listingUrl ? ` View it: ${listingUrl}` : ''}`,
      `/portal/author/projects/${projectId}/distribution`,
      'Your book is on Amazon — Chance Publishers',
    );
  }

  return redirect(`/portal/admin/projects/${projectId}`);
};
