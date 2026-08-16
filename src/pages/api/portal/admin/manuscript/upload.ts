export const prerender = false;

import type { APIRoute } from 'astro';
import { randomBytes } from 'node:crypto';
import { prisma } from '../../../../../lib/db';
import { getStorage } from '../../../../../lib/storage';
import { userHasRole } from '../../../../../lib/auth/session';
import { logActivity } from '../../../../../lib/notify';
import { validateUpload, DOCUMENT_TYPES } from '../../../../../lib/upload-validation';

// For manuscripts that arrive by email or WhatsApp instead of through the
// author's own portal login — admin downloads the file the client sent and
// uploads it into the project here, same effect as the author uploading it.
export const POST: APIRoute = async ({ request, locals, redirect }) => {
  const user = locals.user;
  if (!user || !(userHasRole(user, 'ADMIN') || userHasRole(user, 'SUPER_ADMIN'))) return redirect('/portal/login');

  const data = await request.formData();
  const projectId = String(data.get('projectId') || '');
  const rawFile = data.get('manuscript');

  const project = await prisma.bookProject.findUnique({
    where: { id: projectId },
    include: { ndaAgreement: true },
  });
  if (!project) return redirect('/portal/admin');
  if (project.ndaAgreement?.status !== 'EXECUTED') {
    return redirect(`/portal/admin/projects/${projectId}?error=nda-not-executed`);
  }
  const validated = validateUpload(rawFile, DOCUMENT_TYPES);
  if (!validated.ok) {
    return redirect(`/portal/admin/projects/${projectId}?error=${validated.error}`);
  }
  const file = validated.file;

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
    ...(existingCount === 0
      ? [prisma.bookProject.update({
          where: { id: projectId },
          data: { status: 'ACTIVE', currentStageKey: 'ADMIN_REVIEW', overallProgress: 15 },
        })]
      : []),
  ]);

  await logActivity(projectId, `Manuscript uploaded by admin on the client's behalf (v${existingCount + 1})`);

  return redirect(`/portal/admin/projects/${projectId}?manuscript=submitted`);
};
