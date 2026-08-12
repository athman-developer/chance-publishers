import { prisma } from './db';
import { nextDocumentNumber } from './documents';

export async function setPricingAndApprove(
  printJobId: string,
  data: { supplierPriceKes: number; clientPriceKes: number; turnaroundDays: number; printerName: string },
) {
  await prisma.printJob.update({
    where: { id: printJobId },
    data: {
      supplierPriceKes: data.supplierPriceKes,
      clientPriceKes: data.clientPriceKes,
      turnaroundDays: data.turnaroundDays,
      printerName: data.printerName,
      status: 'QUOTE_APPROVED',
    },
  });
}

export async function generateClientInvoice(printJobId: string) {
  const printJob = await prisma.printJob.findUniqueOrThrow({ where: { id: printJobId } });
  if (!printJob.clientPriceKes) throw new Error('Set client pricing before invoicing.');

  const invoiceNumber = await nextDocumentNumber('INV');
  const invoice = await prisma.invoice.create({
    data: {
      invoiceNumber,
      projectId: printJob.projectId,
      type: 'PRINTING',
      status: 'SENT',
      amountKes: printJob.clientPriceKes,
      label: `Printing — ${printJob.printJobNumber}`,
      items: {
        create: [
          {
            description: `Printing: ${printJob.quantity} × ${printJob.bookSize} ${printJob.coverType.toLowerCase()}, ${printJob.pageCount}pp`,
            quantity: 1,
            unitPriceKes: printJob.clientPriceKes,
          },
        ],
      },
    },
  });

  await prisma.printJob.update({ where: { id: printJobId }, data: { invoiceId: invoice.id, status: 'CLIENT_INVOICED' } });
  return invoice;
}

const STAGE_ORDER = [
  'REQUESTED', 'SUPPLIER_QUOTE_PENDING', 'QUOTE_APPROVED', 'CLIENT_INVOICED',
  'PRINTER_ACCEPTED', 'PRODUCTION_STARTED', 'SAMPLE_READY', 'QC_APPROVED',
  'FULL_PRINT_RUN', 'COMPLETED', 'DELIVERED',
] as const;

// PRINTING — ON PAYMENT HOLD: production cannot start until the client
// invoice is fully paid — see spec Section 11's worked example.
export async function advancePrintJob(printJobId: string, targetStatus: (typeof STAGE_ORDER)[number]) {
  const printJob = await prisma.printJob.findUniqueOrThrow({ where: { id: printJobId }, include: { invoice: true } });

  if (targetStatus === 'PRINTER_ACCEPTED' && printJob.invoice?.status !== 'PAID') {
    throw new Error('Cannot move to production — the client invoice has not been paid yet.');
  }

  const data: Record<string, unknown> = { status: targetStatus };
  if (targetStatus === 'PRODUCTION_STARTED') {
    const start = new Date();
    data.productionStartDate = start;
    if (printJob.turnaroundDays) {
      data.expectedDeliveryDate = new Date(start.getTime() + printJob.turnaroundDays * 24 * 60 * 60 * 1000);
    }
  }
  if (targetStatus === 'DELIVERED') {
    data.deliveredAt = new Date();
  }

  await prisma.printJob.update({ where: { id: printJobId }, data });
}

export function nextStageOptions(current: string): string[] {
  const idx = STAGE_ORDER.indexOf(current as any);
  if (idx === -1 || idx === STAGE_ORDER.length - 1) return [];
  return [STAGE_ORDER[idx + 1]];
}
