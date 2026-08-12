export const prerender = false;

import type { APIRoute } from 'astro';
import { randomBytes } from 'node:crypto';
import { prisma } from '../../../../../lib/db';
import { getStorage } from '../../../../../lib/storage';
import { userHasRole } from '../../../../../lib/auth/session';
import { notify, logActivity } from '../../../../../lib/notify';
import { validateUpload, IMAGE_OR_PDF_TYPES } from '../../../../../lib/upload-validation';

export const POST: APIRoute = async ({ request, locals, redirect }) => {
  const user = locals.user;
  if (!user || (!userHasRole(user, 'ADMIN') && !userHasRole(user, 'SUPER_ADMIN'))) {
    return redirect('/portal/login');
  }

  const data = await request.formData();
  const printJobId = String(data.get('printJobId') || '');
  const file = data.get('sample');

  const printJob = await prisma.printJob.findUnique({ where: { id: printJobId }, include: { project: true } });
  if (!printJob) return redirect(`/portal/print-jobs/${printJobId}`);

  const validated = validateUpload(file, IMAGE_OR_PDF_TYPES);
  if (!validated.ok) return redirect(`/portal/print-jobs/${printJobId}?error=${validated.error}`);

  const storage = await getStorage();
  const buffer = Buffer.from(await validated.file.arrayBuffer());
  const key = `print-samples/${printJob.projectId}/${randomBytes(8).toString('hex')}-${validated.file.name}`;
  await storage.put(key, buffer, validated.file.type);

  const fileAsset = await prisma.fileAsset.create({
    data: {
      projectId: printJob.projectId,
      kind: 'PRINT_SAMPLE',
      storageKey: key,
      originalFilename: validated.file.name,
      contentType: validated.file.type,
      sizeBytes: buffer.length,
      uploadedByUserId: user.id,
    },
  });

  await prisma.$transaction([
    prisma.approval.create({
      data: {
        projectId: printJob.projectId,
        fileAssetId: fileAsset.id,
        kind: 'SAMPLE_DUMMY',
        status: 'PENDING',
        requestedByUserId: user.id,
      },
    }),
    prisma.printJob.update({ where: { id: printJobId }, data: { status: 'SAMPLE_READY' } }),
  ]);

  await notify(printJob.project.authorId, 'PRINT_SAMPLE_READY', `A print sample for ${printJob.printJobNumber} is ready for your approval`, `/portal/print-jobs/${printJobId}`);
  await logActivity(printJob.projectId, `Print sample uploaded for ${printJob.printJobNumber}`);

  return redirect(`/portal/print-jobs/${printJobId}`);
};
