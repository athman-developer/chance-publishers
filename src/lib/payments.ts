import { prisma } from './db';
import { getStorage } from './storage';
import { fillTemplate, renderNdaPdf } from './nda';
import { renderFinanceDocumentPdf } from './finance-pdf';
import { nextDocumentNumber } from './documents';
import { notify, logActivity } from './notify';
import { sendSms } from './sms';
import { sendEmail } from './email';
import { sendWhatsAppMessage } from './whatsapp';
import { logAdminAction } from './audit';

// Marks a payment VERIFIED, and if it fully covers its invoice, marks the
// invoice PAID. If that invoice is an NDA fee, this is the one place the NDA
// moves from FEE_INVOICED to FEE_PAID and has its unsigned PDF generated —
// server-side, never trusting a frontend "I have paid" click. Also generates
// an immutable receipt PDF for every verified payment.
export async function verifyPayment(paymentId: string, verifiedByUserId: string) {
  const existing = await prisma.payment.findUniqueOrThrow({ where: { id: paymentId } });
  if (existing.status === 'VERIFIED') return existing;

  const payment = await prisma.payment.update({
    where: { id: paymentId },
    data: { status: 'VERIFIED', verifiedByUserId, verifiedAt: new Date() },
    include: {
      invoice: {
        include: {
          payments: true,
          project: { include: { author: { include: { authorProfile: true } } } },
          ndaAgreement: { include: { template: true, project: { include: { author: { include: { authorProfile: true } }, contributors: true } } } },
        },
      },
    },
  });

  const invoice = payment.invoice;
  const verifiedTotal = invoice.payments
    .filter((p) => p.status === 'VERIFIED' || p.id === payment.id)
    .reduce((sum, p) => sum + Number(p.amountKes), 0);

  if (verifiedTotal >= Number(invoice.amountKes)) {
    await prisma.invoice.update({ where: { id: invoice.id }, data: { status: 'PAID' } });

    if (invoice.type === 'NDA_FEE' && invoice.ndaAgreement) {
      await generateUnsignedNda(invoice.ndaAgreement.id);
    }
  } else {
    await prisma.invoice.update({ where: { id: invoice.id }, data: { status: 'PARTIALLY_PAID' } });
  }

  await generateReceipt(payment.id);
  await logAdminAction(
    verifiedByUserId,
    'PAYMENT_VERIFIED',
    'Payment',
    payment.id,
    `${payment.method.replaceAll('_', ' ')} · KSh ${Number(payment.amountKes).toLocaleString()} · ${invoice.invoiceNumber} (${invoice.label || invoice.type}) · ${invoice.project.title}`,
  );
  await notify(
    invoice.project.authorId,
    'PAYMENT_VERIFIED',
    `Payment of KSh ${Number(payment.amountKes).toLocaleString()} verified for ${invoice.label || invoice.type}`,
    `/portal/invoices/${invoice.id}`,
  );
  await logActivity(invoice.projectId, `${payment.method.replaceAll('_', ' ')} payment of KSh ${Number(payment.amountKes).toLocaleString()} verified against ${invoice.invoiceNumber}`);

  const paymentMessage = `Chance Publishers: We've received your payment of KSh ${Number(payment.amountKes).toLocaleString()} for ${invoice.label || invoice.type} (${invoice.invoiceNumber}). Thank you.`;

  const authorPhone = invoice.project.author.phone;
  if (authorPhone) {
    await sendSms(authorPhone, paymentMessage).catch((err) => console.error('verifyPayment: SMS send failed', err));
    await sendWhatsAppMessage(authorPhone, paymentMessage).catch((err) => console.error('verifyPayment: WhatsApp send failed', err));
  }

  const authorEmail = invoice.project.author.email;
  if (authorEmail) {
    await sendEmail(authorEmail, 'Payment received — Chance Publishers', paymentMessage).catch((err) =>
      console.error('verifyPayment: email send failed', err),
    );
  }

  return payment;
}

export async function generateReceipt(paymentId: string) {
  const existingReceipt = await prisma.fileAsset.findUnique({ where: { paymentId } });
  if (existingReceipt) return existingReceipt;

  const payment = await prisma.payment.findUniqueOrThrow({
    where: { id: paymentId },
    include: { invoice: { include: { project: { include: { author: { include: { authorProfile: true } } } } } } },
  });

  const receiptNumber = await nextDocumentNumber('RCP');
  const pdf = await renderFinanceDocumentPdf({
    title: 'Receipt',
    documentNumber: receiptNumber,
    date: new Date().toLocaleDateString('en-GB'),
    projectTitle: payment.invoice.project.title,
    authorName: payment.invoice.project.author.authorProfile?.fullLegalName || payment.invoice.project.author.email,
    items: [{ description: `${payment.invoice.label || payment.invoice.type} — ${payment.method.replaceAll('_', ' ')}${payment.reference ? ` (Ref: ${payment.reference})` : ''}`, quantity: 1, unitPriceKes: payment.amountKes }],
    totalLabel: 'Amount received',
    footerNote: `Received against invoice ${payment.invoice.invoiceNumber}. Thank you for your payment.`,
  });

  const storage = await getStorage();
  const key = `receipts/${payment.invoice.projectId}/${receiptNumber}.pdf`;
  await storage.put(key, pdf, 'application/pdf');

  await prisma.fileAsset.create({
    data: {
      projectId: payment.invoice.projectId,
      paymentId: payment.id,
      kind: 'RECEIPT',
      storageKey: key,
      originalFilename: `${receiptNumber}.pdf`,
      contentType: 'application/pdf',
      sizeBytes: pdf.length,
    },
  });
}

export async function recordCashPayment(invoiceId: string, amountKes: number, recordedByUserId: string) {
  const payment = await prisma.payment.create({
    data: {
      invoiceId,
      method: 'CASH',
      amountKes,
      status: 'PENDING_VERIFICATION',
      recordedByUserId,
    },
  });
  return verifyPayment(payment.id, recordedByUserId);
}

// Cheque payments never count as settled until CLEARED — see spec Section 10.
export async function recordChequePayment(
  invoiceId: string,
  amountKes: number,
  chequeDetails: { chequeNumber: string; bank: string; drawer: string },
  recordedByUserId: string,
) {
  const payment = await prisma.payment.create({
    data: { invoiceId, method: 'CHEQUE', amountKes, status: 'PENDING_VERIFICATION', recordedByUserId },
  });
  await prisma.cheque.create({
    data: { paymentId: payment.id, ...chequeDetails, status: 'RECEIVED' },
  });
  return payment;
}

export async function advanceCheque(chequeId: string, action: 'deposit' | 'clear' | 'bounce', verifiedByUserId: string) {
  const cheque = await prisma.cheque.findUniqueOrThrow({ where: { id: chequeId } });

  if (action === 'deposit' && cheque.status === 'RECEIVED') {
    await prisma.cheque.update({ where: { id: chequeId }, data: { status: 'AWAITING_CLEARANCE', depositDate: new Date() } });
  } else if (action === 'clear' && cheque.status === 'AWAITING_CLEARANCE') {
    await prisma.cheque.update({ where: { id: chequeId }, data: { status: 'CLEARED', clearanceDate: new Date() } });
    await verifyPayment(cheque.paymentId, verifiedByUserId);
  } else if (action === 'bounce' && cheque.status === 'AWAITING_CLEARANCE') {
    await prisma.$transaction([
      prisma.cheque.update({ where: { id: chequeId }, data: { status: 'BOUNCED' } }),
      prisma.payment.update({ where: { id: cheque.paymentId }, data: { status: 'REJECTED' } }),
    ]);
    await logAdminAction(verifiedByUserId, 'CHEQUE_BOUNCED', 'Cheque', chequeId, `Cheque #${cheque.chequeNumber} from ${cheque.bank} bounced`);
  }
}

export async function generateUnsignedNda(ndaAgreementId: string) {
  const nda = await prisma.ndaAgreement.findUniqueOrThrow({
    where: { id: ndaAgreementId },
    include: {
      template: true,
      project: { include: { author: { include: { authorProfile: true } }, contributors: true } },
    },
  });

  const author = nda.project.author.authorProfile;
  const body = fillTemplate(nda.template.bodyMarkdown, {
    NDA_REFERENCE: nda.ndaNumber,
    AGREEMENT_DATE: new Date().toLocaleDateString('en-GB'),
    AUTHOR_FULL_NAME: author?.fullLegalName || nda.project.author.email,
    AUTHOR_ID_OR_PASSPORT: nda.authorIdOrPassport || '—',
    BOOK_TITLE: nda.project.title,
    EDITION: nda.project.edition || '1st Edition',
    CONTRIBUTORS: nda.project.contributors.map((c) => c.name).join(', ') || 'None',
    ALTERNATIVE_CONTACT_NAME: nda.altContactName || '—',
    ALTERNATIVE_CONTACT_RELATIONSHIP: nda.altContactRelationship || '—',
    ALTERNATIVE_CONTACT_PHONE: nda.altContactPhone || '—',
    ALTERNATIVE_CONTACT_ID: nda.altContactIdOrPassport || '—',
    ALTERNATIVE_CONTACT_EMAIL: nda.altContactEmail || '—',
    PUBLISHER_SIGNATORY: nda.template.publisherSignatoryName || 'Chance Publishers Limited',
    AUTHOR_SIGNATURE: '________________________ (pending signature)',
    WITNESS_NAME: '________________________',
    WITNESS_ID: '________________________',
    WITNESS_SIGNATURE: '________________________',
    SIGNATURE_DATE: '________________________',
  });

  const pdfBuffer = await renderNdaPdf(body, `NDA — ${nda.ndaNumber}`);
  const storage = await getStorage();
  const key = `nda/${nda.projectId}/${nda.ndaNumber}-unsigned.pdf`;
  await storage.put(key, pdfBuffer, 'application/pdf');

  await prisma.ndaAgreement.update({
    where: { id: nda.id },
    data: {
      status: 'AWAITING_AUTHOR_SIGNATURE',
      generatedPdfKey: key,
    },
  });
}
