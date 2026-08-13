import { prisma } from './db';
import { nextDocumentNumber } from './documents';

export interface ParsedLineItem {
  description: string;
  quantity: number;
  unitPriceKes: number;
}

// Line items are entered as one-per-line "description | qty | unit price"
// to keep the admin form simple without a dynamic multi-row JS widget.
export function parseLineItems(text: string): ParsedLineItem[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [description, qtyRaw, priceRaw] = line.split('|').map((s) => s.trim());
      return {
        description: description || 'Item',
        quantity: Math.max(1, parseInt(qtyRaw, 10) || 1),
        unitPriceKes: Math.max(0, parseFloat(priceRaw) || 0),
      };
    });
}

export function quotationTotal(items: ParsedLineItem[]): number {
  return items.reduce((sum, i) => sum + i.quantity * i.unitPriceKes, 0);
}

export const TERM_SPLITS: Record<string, { label: string; percent: number }[]> = {
  '70/30': [
    { label: 'Deposit (70%)', percent: 70 },
    { label: 'Balance (30%)', percent: 30 },
  ],
  '50/50': [
    { label: 'Deposit (50%)', percent: 50 },
    { label: 'Balance (50%)', percent: 50 },
  ],
  '100_UPFRONT': [{ label: 'Full payment (100% upfront)', percent: 100 }],
  ON_COMPLETION: [{ label: 'Payment on completion', percent: 100 }],
};

const INVOICE_TYPE_BY_QUOTATION_TYPE: Record<string, string> = {
  PUBLISHING: 'PUBLISHING',
  PRINTING: 'PRINTING',
  LAUNCH: 'LAUNCH',
  ADDITIONAL_SERVICES: 'OTHER',
  CUSTOM: 'OTHER',
};

// Converts an accepted quotation into one or more invoices per its payment
// terms, copying line items proportionally so nothing needs re-entering.
export async function convertQuotationToInvoices(quotationId: string) {
  const quotation = await prisma.quotation.findUniqueOrThrow({
    where: { id: quotationId },
    include: { items: true },
  });

  const total = quotation.items.reduce((sum, i) => sum + i.quantity * Number(i.unitPriceKes), 0);
  const splits = TERM_SPLITS[quotation.paymentTerms] || TERM_SPLITS['100_UPFRONT'];
  const invoiceType = INVOICE_TYPE_BY_QUOTATION_TYPE[quotation.type] || 'OTHER';

  const createdInvoices = [];
  for (const split of splits) {
    const invoiceNumber = await nextDocumentNumber('INV');
    const amount = Math.round((total * split.percent) / 100 * 100) / 100;
    const invoice = await prisma.invoice.create({
      data: {
        invoiceNumber,
        projectId: quotation.projectId,
        type: invoiceType as any,
        status: 'SENT',
        amountKes: amount,
        label: split.label,
        quotationId: quotation.id,
        items: {
          create: quotation.items.map((item) => ({
            description: item.description,
            quantity: item.quantity,
            unitPriceKes: (Number(item.unitPriceKes) * split.percent) / 100,
            sortOrder: item.sortOrder,
          })),
        },
      },
    });
    createdInvoices.push(invoice);
  }

  await prisma.quotation.update({ where: { id: quotationId }, data: { status: 'CONVERTED_TO_INVOICE', decidedAt: new Date() } });
  return createdInvoices;
}

// Publishing package prices are fixed (not negotiated), so unlike custom
// printing/launch work there's no need to wait for an admin-built quotation
// — invoice the package deposit/balance the moment the author starts their
// NDA, using the site's default payment terms (e.g. 70/30). Called once per
// project; a no-op if the project has no package selected or invoices
// already exist (e.g. NDA restarted).
export async function createPackageInvoices(projectId: string) {
  const project = await prisma.bookProject.findUniqueOrThrow({ where: { id: projectId }, include: { package: true } });
  if (!project.package) return [];

  const existing = await prisma.invoice.findFirst({
    where: { projectId, type: 'PUBLISHING', quotationId: null, ndaAgreementId: null },
  });
  if (existing) return [];

  const termsSetting = await prisma.systemSetting.findUnique({ where: { key: 'DEFAULT_CLIENT_PAYMENT_TERMS' } });
  const splits = TERM_SPLITS[termsSetting?.value || '70/30'] || TERM_SPLITS['70/30'];
  const total = Number(project.package.priceKes);

  const createdInvoices = [];
  for (const split of splits) {
    const invoiceNumber = await nextDocumentNumber('INV');
    const amount = Math.round((total * split.percent) / 100 * 100) / 100;
    const invoice = await prisma.invoice.create({
      data: {
        invoiceNumber,
        projectId,
        type: 'PUBLISHING',
        status: 'SENT',
        amountKes: amount,
        label: `${project.package.name} package — ${split.label}`,
        description: `${project.package.name} publishing package`,
      },
    });
    createdInvoices.push(invoice);
  }
  return createdInvoices;
}
