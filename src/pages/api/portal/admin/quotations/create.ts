export const prerender = false;

import type { APIRoute } from 'astro';
import { prisma } from '../../../../../lib/db';
import { nextDocumentNumber } from '../../../../../lib/documents';
import { userHasRole } from '../../../../../lib/auth/session';
import { parseLineItems } from '../../../../../lib/finance';
import { logAdminAction } from '../../../../../lib/audit';

export const POST: APIRoute = async ({ request, locals, redirect }) => {
  const user = locals.user;
  if (!user || (!userHasRole(user, 'ADMIN') && !userHasRole(user, 'SUPER_ADMIN'))) {
    return redirect('/portal/login');
  }

  const data = await request.formData();
  const projectId = String(data.get('projectId') || '');
  const type = String(data.get('type') || 'PUBLISHING');
  const paymentTerms = String(data.get('paymentTerms') || '70/30');
  const validDays = Number(data.get('validDays') || 14);
  const notes = String(data.get('notes') || '').trim() || null;
  const itemsText = String(data.get('items') || '');

  const items = parseLineItems(itemsText);
  if (!projectId || items.length === 0) {
    return redirect(`/portal/admin/projects/${projectId}?error=missing-quotation-fields`);
  }

  const quotationNumber = await nextDocumentNumber('QT');
  const validUntil = new Date(Date.now() + validDays * 24 * 60 * 60 * 1000);

  const quotation = await prisma.quotation.create({
    data: {
      quotationNumber,
      projectId,
      type: type as any,
      status: 'SENT',
      paymentTerms,
      validUntil,
      notes,
      createdByUserId: user.id,
      items: {
        create: items.map((item, i) => ({
          description: item.description,
          quantity: item.quantity,
          unitPriceKes: item.unitPriceKes,
          sortOrder: i,
        })),
      },
    },
  });

  const total = items.reduce((sum, item) => sum + item.quantity * item.unitPriceKes, 0);
  await logAdminAction(user.id, 'QUOTATION_CREATED', 'Quotation', quotation.id, `${quotationNumber} · KSh ${total.toLocaleString()} · ${type}`);

  return redirect(`/portal/admin/projects/${projectId}`);
};
