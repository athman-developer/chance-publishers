import { randomBytes } from 'node:crypto';
import { prisma } from './db';
import { STAGE_LABELS } from './workflow';
import { sendSms } from './sms';
import { sendEmail } from './email';
import { sendWhatsAppMessage } from './whatsapp';

// A long random token used as an unguessable capability URL — anyone with
// the link can view the project read-only, no login required. Meant for
// clients who won't use the portal but still want visibility. Read-only by
// design: the share page never exposes a way to post messages, make
// payments, or download internal-only documents (internal notes, task
// pricing) — only what the author would already see.
export async function ensureShareToken(projectId: string): Promise<string> {
  const project = await prisma.bookProject.findUniqueOrThrow({ where: { id: projectId } });
  if (project.shareToken) return project.shareToken;

  const token = randomBytes(24).toString('base64url');
  await prisma.bookProject.update({ where: { id: projectId }, data: { shareToken: token } });
  return token;
}

export async function revokeShareToken(projectId: string): Promise<void> {
  await prisma.bookProject.update({ where: { id: projectId }, data: { shareToken: null } });
}

export function shareUrl(siteUrl: string, token: string): string {
  return `${siteUrl}/portal/share/${token}`;
}

// Sends a plain-language status update (progress, next step, outstanding
// balance, and the share link) to the author's phone/email — for clients
// who want to be told about news rather than checking a link themselves.
export async function sendProjectUpdate(projectId: string, siteUrl: string) {
  const project = await prisma.bookProject.findUniqueOrThrow({
    where: { id: projectId },
    include: {
      author: true,
      invoices: { include: { payments: true } },
    },
  });

  const token = await ensureShareToken(projectId);
  const link = shareUrl(siteUrl, token);
  const stageLabel = STAGE_LABELS[project.currentStageKey] || project.currentStageKey.replaceAll('_', ' ');

  const outstanding = project.invoices.reduce((sum, inv) => {
    const paid = inv.payments.filter((p) => p.status === 'VERIFIED').reduce((s, p) => s + Number(p.amountKes), 0);
    return sum + Math.max(0, Number(inv.amountKes) - paid);
  }, 0);

  const lines = [
    `Chance Publishers update on "${project.title}"`,
    `Progress: ${project.overallProgress}% — ${stageLabel}`,
  ];
  if (outstanding > 0) lines.push(`Outstanding balance: KSh ${outstanding.toLocaleString()}`);
  lines.push(`Track your book anytime here: ${link}`);
  const message = lines.join('\n');

  const results = { sms: false, whatsapp: false, email: false };

  if (project.author.phone) {
    const smsResult = await sendSms(project.author.phone, message).catch(() => ({ ok: false }));
    results.sms = smsResult.ok;
    const waResult = await sendWhatsAppMessage(project.author.phone, message).catch(() => ({ ok: false }));
    results.whatsapp = waResult.ok;
  }
  if (project.author.email) {
    const emailResult = await sendEmail(project.author.email, `Update on "${project.title}" — Chance Publishers`, message).catch(() => ({ ok: false }));
    results.email = emailResult.ok;
  }

  return { link, results };
}
