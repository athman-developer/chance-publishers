// Shared task-type configuration used by admin task assignment, employee task
// pages, and the author approval workflow. Deliberately small and explicit
// for Phase 3 — a fully admin-configurable workflow/task-type builder is
// future work (see docs/PORTAL_MASTER_SPEC.md Section 5 phase plan).
export const TASK_TYPES = [
  { key: 'EDITING', label: 'Manuscript Editing', stageKey: 'EDITING', deliverableKind: 'EDITED_MANUSCRIPT', approvalKind: 'EDITED_MANUSCRIPT', requiresAuthorApproval: false },
  { key: 'PROOFREADING', label: 'Proofreading', stageKey: 'PROOFREADING', deliverableKind: 'PROOFREAD_MANUSCRIPT', approvalKind: 'PROOFREADING', requiresAuthorApproval: false },
  { key: 'LAYOUT', label: 'Interior Layout', stageKey: 'BOOK_ALIGNMENT_LAYOUT', deliverableKind: 'LAYOUT_PROOF', approvalKind: 'LAYOUT', requiresAuthorApproval: true },
  { key: 'COVER_DESIGN', label: 'Cover Design', stageKey: 'COVER_DESIGN', deliverableKind: 'COVER_DESIGN', approvalKind: 'COVER_DESIGN', requiresAuthorApproval: true },
] as const;

export type TaskTypeKey = (typeof TASK_TYPES)[number]['key'];

export function taskTypeConfig(key: string) {
  return TASK_TYPES.find((t) => t.key === key);
}

// Stage weights driving BookProject.overallProgress — see spec Section 28.
export const STAGE_WEIGHTS: Record<string, number> = {
  AUTHOR_ONBOARDING: 5,
  MANUSCRIPT_SUBMITTED: 5,
  ADMIN_REVIEW: 5,
  EDITING: 20,
  PROOFREADING: 10,
  BOOK_ALIGNMENT_LAYOUT: 15,
  COVER_DESIGN: 15,
  FINAL_AUTHOR_APPROVAL: 10,
  PRINTING: 10,
  DELIVERY_LAUNCH: 5,
};

export const STAGE_ORDER = Object.keys(STAGE_WEIGHTS);

// Plain-language labels for the author-facing stage tracker — see the
// "what's next" guide on the project page (spec: make the portal easier to
// follow without redesigning it).
export const STAGE_LABELS: Record<string, string> = {
  AUTHOR_ONBOARDING: 'Getting started',
  MANUSCRIPT_SUBMITTED: 'Manuscript',
  ADMIN_REVIEW: 'Admin review',
  EDITING: 'Editing',
  PROOFREADING: 'Proofreading',
  BOOK_ALIGNMENT_LAYOUT: 'Interior layout',
  COVER_DESIGN: 'Cover design',
  FINAL_AUTHOR_APPROVAL: 'Final approval',
  PRINTING: 'Printing',
  DELIVERY_LAUNCH: 'Delivery & launch',
};

export function progressForCompletedStages(completedStageKeys: string[]): number {
  const total = completedStageKeys.reduce((sum, key) => sum + (STAGE_WEIGHTS[key] || 0), 0);
  return Math.min(100, total);
}

export function nextStageAfter(stageKey: string): string | null {
  const idx = STAGE_ORDER.indexOf(stageKey);
  if (idx === -1 || idx === STAGE_ORDER.length - 1) return null;
  return STAGE_ORDER[idx + 1];
}

export async function completeTaskAndAdvanceProject(
  prisma: import('@prisma/client').PrismaClient,
  taskId: string,
) {
  const task = await prisma.task.findUniqueOrThrow({ where: { id: taskId } });
  const weight = STAGE_WEIGHTS[task.stageKey] || 0;

  await prisma.$transaction([
    prisma.task.update({
      where: { id: taskId },
      data: { status: 'COMPLETED', completedAt: new Date() },
    }),
    prisma.bookProject.update({
      where: { id: task.projectId },
      data: {
        overallProgress: { increment: weight },
        currentStageKey: nextStageAfter(task.stageKey) || undefined,
      },
    }),
  ]);

  // increment can push past 100 if stages overlap in weight accounting; clamp separately.
  const project = await prisma.bookProject.findUniqueOrThrow({ where: { id: task.projectId } });
  if (project.overallProgress > 100) {
    await prisma.bookProject.update({ where: { id: task.projectId }, data: { overallProgress: 100 } });
  }
}
