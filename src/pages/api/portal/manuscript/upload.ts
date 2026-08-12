export const prerender = false;

import type { APIRoute } from 'astro';
import { randomBytes } from 'node:crypto';
import { prisma } from '../../../../lib/db';
import { getStorage } from '../../../../lib/storage';
import { notifyAdmins, logActivity } from '../../../../lib/notify';

const ALLOWED_TYPES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/rtf',
  'application/vnd.oasis.opendocument.text',
]);
const MAX_SIZE_BYTES = 25 * 1024 * 1024; // 25MB

export const POST: APIRoute = async ({ request, locals, redirect }) => {
  const user = locals.user;
  if (!user) return redirect('/portal/login');

  const data = await request.formData();
  const projectId = String(data.get('projectId') || '');
  const file = data.get('manuscript');

  const project = await prisma.bookProject.findUnique({
    where: { id: projectId },
    include: { ndaAgreement: true },
  });
  if (!project || project.authorId !== user.id) return redirect('/portal/author');
  if (project.ndaAgreement?.status !== 'EXECUTED') {
    return redirect(`/portal/author/projects/${projectId}?error=nda-not-executed`);
  }
  if (!(file instanceof File) || file.size === 0) {
    return redirect(`/portal/author/projects/${projectId}?error=no-file`);
  }
  if (file.size > MAX_SIZE_BYTES) {
    return redirect(`/portal/author/projects/${projectId}?error=file-too-large`);
  }
  if (!ALLOWED_TYPES.has(file.type)) {
    return redirect(`/portal/author/projects/${projectId}?error=unsupported-file-type`);
  }

  const storage = await getStorage();
  const buffer = Buffer.from(await file.arrayBuffer());
  const key = `manuscripts/${projectId}/${randomBytes(8).toString('hex')}-${file.name}`;
  await storage.put(key, buffer, file.type);

  const existingCount = await prisma.fileAsset.count({ where: { projectId, kind: 'MANUSCRIPT' } });

  await prisma.$transaction([
    prisma.fileAsset.create({
      data: {
        projectId,
        kind: 'MANUSCRIPT',
        storageKey: key,
        originalFilename: file.name,
        contentType: file.type,
        sizeBytes: buffer.length,
        uploadedByUserId: user.id,
        version: existingCount + 1,
      },
    }),
    prisma.bookProject.update({
      where: { id: projectId },
      data: { status: 'ACTIVE', currentStageKey: 'ADMIN_REVIEW', overallProgress: 15 },
    }),
  ]);

  await notifyAdmins('OTHER', `Manuscript submitted for "${project.title}"`, `/portal/admin/projects/${projectId}`);
  await logActivity(projectId, `Manuscript submitted (v${existingCount + 1})`);

  return redirect(`/portal/author/projects/${projectId}?manuscript=submitted`);
};
