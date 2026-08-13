export const prerender = false;

import type { APIRoute } from 'astro';
import { prisma } from '../../../../lib/db';
import { nextDocumentNumber } from '../../../../lib/documents';
import { logActivity } from '../../../../lib/notify';

export const POST: APIRoute = async ({ request, locals, redirect }) => {
  const user = locals.user;
  if (!user) return redirect('/portal/login');

  const data = await request.formData();
  const title = String(data.get('title') || '').trim();
  if (!title) return redirect('/portal/author/projects/new?error=missing-title');

  const packageId = String(data.get('packageId') || '').trim() || null;
  if (!packageId) return redirect('/portal/author/projects/new?error=missing-package');
  const packageExists = await prisma.publishingPackage.findUnique({ where: { id: packageId } });
  if (!packageExists) return redirect('/portal/author/projects/new?error=missing-package');

  const subtitle = String(data.get('subtitle') || '').trim() || null;
  const genreRaw = String(data.get('genre') || '').trim();
  const genre = (genreRaw === '__other__' ? String(data.get('genreOther') || '').trim() : genreRaw) || null;
  const language = String(data.get('language') || '').trim() || null;
  const pageCountRaw = data.get('pageCountApprox');
  const pageCountApprox = pageCountRaw ? Number(pageCountRaw) : null;
  const notes = String(data.get('notes') || '').trim() || null;

  const projectNumber = await nextDocumentNumber('PRJ');

  const project = await prisma.bookProject.create({
    data: {
      projectNumber,
      authorId: user.id,
      title,
      subtitle,
      genre,
      language,
      pageCountApprox,
      packageId,
      notes,
      status: 'ONBOARDING',
      currentStageKey: 'AUTHOR_ONBOARDING',
      overallProgress: 5,
    },
  });

  await logActivity(project.id, `Book project created: "${title}"`);

  return redirect(`/portal/author/projects/${project.id}/nda`);
};
