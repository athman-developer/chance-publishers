import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

export function formatKes(amount: number | string): string {
  return `KSh ${Number(amount).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

interface LineItem {
  description: string;
  quantity: number;
  unitPriceKes: number | string;
}

interface DocumentPdfOptions {
  title: string;
  documentNumber: string;
  date: string;
  projectTitle: string;
  authorName: string;
  items: LineItem[];
  totalLabel?: string;
  footerNote?: string;
}

export async function renderFinanceDocumentPdf(opts: DocumentPdfOptions): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const pageSize: [number, number] = [595.28, 841.89];
  const margin = 56;
  let page = doc.addPage(pageSize);
  let y = pageSize[1] - margin;

  const green = rgb(0.05, 0.42, 0.24);
  const gray = rgb(0.44, 0.5, 0.47);
  const dark = rgb(0.09, 0.12, 0.1);

  page.drawText('CHANCE PUBLISHERS', { x: margin, y, size: 18, font: bold, color: green });
  page.drawText(opts.title.toUpperCase(), { x: pageSize[0] - margin - bold.widthOfTextAtSize(opts.title.toUpperCase(), 14), y, size: 14, font: bold, color: dark });
  y -= 22;
  page.drawText(`${opts.documentNumber} — ${opts.date}`, { x: pageSize[0] - margin - font.widthOfTextAtSize(`${opts.documentNumber} — ${opts.date}`, 10), y, size: 10, font, color: gray });
  y -= 40;

  page.drawText('Book Project:', { x: margin, y, size: 10, font: bold, color: dark });
  page.drawText(opts.projectTitle, { x: margin + 90, y, size: 10, font, color: dark });
  y -= 16;
  page.drawText('Author:', { x: margin, y, size: 10, font: bold, color: dark });
  page.drawText(opts.authorName, { x: margin + 90, y, size: 10, font, color: dark });
  y -= 32;

  const colX = { desc: margin, qty: pageSize[0] - margin - 220, price: pageSize[0] - margin - 150, total: pageSize[0] - margin - 70 };
  page.drawText('Description', { x: colX.desc, y, size: 9, font: bold, color: gray });
  page.drawText('Qty', { x: colX.qty, y, size: 9, font: bold, color: gray });
  page.drawText('Unit Price', { x: colX.price, y, size: 9, font: bold, color: gray });
  page.drawText('Total', { x: colX.total, y, size: 9, font: bold, color: gray });
  y -= 6;
  page.drawLine({ start: { x: margin, y }, end: { x: pageSize[0] - margin, y }, thickness: 0.7, color: gray });
  y -= 16;

  let total = 0;
  for (const item of opts.items) {
    const lineTotal = item.quantity * Number(item.unitPriceKes);
    total += lineTotal;
    const descLines = wrapText(item.description, font, 9.5, colX.qty - colX.desc - 10);
    for (const [i, line] of descLines.entries()) {
      if (y < margin + 100) {
        page = doc.addPage(pageSize);
        y = pageSize[1] - margin;
      }
      page.drawText(line, { x: colX.desc, y, size: 9.5, font, color: dark });
      if (i === 0) {
        page.drawText(String(item.quantity), { x: colX.qty, y, size: 9.5, font, color: dark });
        page.drawText(formatKes(item.unitPriceKes), { x: colX.price, y, size: 9.5, font, color: dark });
        page.drawText(formatKes(lineTotal), { x: colX.total, y, size: 9.5, font, color: dark });
      }
      y -= 14;
    }
    y -= 6;
  }

  y -= 10;
  page.drawLine({ start: { x: colX.price - 10, y }, end: { x: pageSize[0] - margin, y }, thickness: 0.7, color: gray });
  y -= 20;
  const totalLabel = opts.totalLabel || 'Total';
  page.drawText(totalLabel, { x: colX.price, y, size: 11, font: bold, color: dark });
  page.drawText(formatKes(total), { x: colX.total, y, size: 11, font: bold, color: green });

  if (opts.footerNote) {
    y -= 50;
    const noteLines = wrapText(opts.footerNote, font, 9, pageSize[0] - margin * 2);
    for (const line of noteLines) {
      page.drawText(line, { x: margin, y, size: 9, font, color: gray });
      y -= 13;
    }
  }

  const bytes = await doc.save();
  return Buffer.from(bytes);
}

function wrapText(text: string, font: any, size: number, maxWidth: number): string[] {
  const lines: string[] = [];
  let current = '';
  for (const word of text.split(' ')) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines;
}
