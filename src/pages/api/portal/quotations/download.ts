export const prerender = false;

import type { APIRoute } from 'astro';
import { prisma } from '../../../../lib/db';
import { userHasRole } from '../../../../lib/auth/session';
import { renderFinanceDocumentPdf } from '../../../../lib/finance-pdf';

export const GET: APIRoute = async ({ url, locals }) => {
  const user = locals.user;
  if (!user) return new Response('Unauthorized', { status: 401 });

  const id = url.searchParams.get('id') || '';
  const quotation = await prisma.quotation.findUnique({
    where: { id },
    include: { project: { include: { author: { include: { authorProfile: true } } } }, items: true },
  });
  if (!quotation) return new Response('Not found', { status: 404 });

  const isOwner = quotation.project.authorId === user.id;
  const isAdmin = userHasRole(user, 'ADMIN') || userHasRole(user, 'SUPER_ADMIN');
  if (!isOwner && !isAdmin) return new Response('Forbidden', { status: 403 });

  const pdf = await renderFinanceDocumentPdf({
    title: 'Quotation',
    documentNumber: quotation.quotationNumber,
    date: quotation.createdAt.toLocaleDateString('en-GB'),
    projectTitle: quotation.project.title,
    authorName: quotation.project.author.authorProfile?.fullLegalName || quotation.project.author.email,
    items: quotation.items.map((i) => ({ description: i.description, quantity: i.quantity, unitPriceKes: i.unitPriceKes })),
    footerNote: `Payment terms: ${quotation.paymentTerms}. Valid until ${quotation.validUntil.toLocaleDateString('en-GB')}. Final cost subject to written acceptance.`,
  });

  return new Response(pdf, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${quotation.quotationNumber}.pdf"`,
      'Cache-Control': 'private, no-store',
    },
  });
};
