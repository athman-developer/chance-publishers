export const prerender = false;

import type { APIRoute } from 'astro';
import { prisma } from '../../../../lib/db';
import { convertQuotationToInvoices } from '../../../../lib/finance';
import { notifyAdmins, logActivity } from '../../../../lib/notify';

export const POST: APIRoute = async ({ request, locals, redirect }) => {
  const user = locals.user;
  if (!user) return redirect('/portal/login');

  const data = await request.formData();
  const quotationId = String(data.get('quotationId') || '');
  const action = String(data.get('action') || '');
  const declineReason = String(data.get('declineReason') || '').trim();

  const quotation = await prisma.quotation.findUnique({ where: { id: quotationId }, include: { project: true } });
  if (!quotation || quotation.project.authorId !== user.id) return redirect('/portal/author');
  if (!['SENT', 'VIEWED'].includes(quotation.status)) return redirect(`/portal/quotations/${quotationId}`);

  if (action === 'accept') {
    await prisma.quotation.update({ where: { id: quotationId }, data: { status: 'ACCEPTED', decidedAt: new Date() } });
    await convertQuotationToInvoices(quotationId);
    await notifyAdmins('QUOTATION_ACCEPTED', `Quotation ${quotation.quotationNumber} accepted`, `/portal/quotations/${quotationId}`);
    await logActivity(quotation.projectId, `Quotation ${quotation.quotationNumber} accepted by the author`);
  } else if (action === 'decline') {
    await prisma.quotation.update({
      where: { id: quotationId },
      data: { status: 'DECLINED', decidedAt: new Date(), declineReason: declineReason || null },
    });
    await notifyAdmins('QUOTATION_DECLINED', `Quotation ${quotation.quotationNumber} declined${declineReason ? `: ${declineReason}` : ''}`, `/portal/quotations/${quotationId}`);
    await logActivity(quotation.projectId, `Quotation ${quotation.quotationNumber} declined by the author`);
  }

  return redirect(`/portal/quotations/${quotationId}`);
};
