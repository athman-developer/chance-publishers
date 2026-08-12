export const prerender = false;

import type { APIRoute } from 'astro';
import { prisma } from '../../../../lib/db';
import { nextDocumentNumber } from '../../../../lib/documents';
import { estimatePrintingRange } from '../../../../lib/pricing';

export const POST: APIRoute = async ({ request, locals, redirect }) => {
  const user = locals.user;
  if (!user) return redirect('/portal/login');

  const data = await request.formData();
  const projectId = String(data.get('projectId') || '');
  const bookSize = String(data.get('bookSize') || 'A5') as any;
  const quantity = Number(data.get('quantity') || 0);
  const pageCount = Number(data.get('pageCount') || 0);
  const interiorColor = String(data.get('interiorColor') || 'BW');
  const coverType = String(data.get('coverType') || 'SOFTCOVER') as any;
  const binding = String(data.get('binding') || '').trim() || null;
  const paperType = String(data.get('paperType') || '').trim() || null;
  const specialNotes = String(data.get('specialNotes') || '').trim() || null;

  const project = await prisma.bookProject.findUnique({ where: { id: projectId } });
  if (!project || project.authorId !== user.id || !quantity || !pageCount) {
    return redirect('/portal/author/printing/new?error=missing-fields');
  }

  const estimate = estimatePrintingRange({ bookSize, quantity, coverType });
  const printJobNumber = await nextDocumentNumber('PJ');

  const printJob = await prisma.printJob.create({
    data: {
      printJobNumber,
      projectId,
      status: 'REQUESTED',
      quantity,
      bookSize,
      pageCount,
      interiorColor,
      coverType,
      binding,
      paperType,
      specialNotes,
      estimateLowKes: estimate.lowKes,
      estimateHighKes: estimate.highKes,
    },
  });

  return redirect(`/portal/print-jobs/${printJob.id}`);
};
