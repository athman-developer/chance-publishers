import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

export function fillTemplate(body: string, values: Record<string, string>): string {
  return body.replace(/\{\{(\w+)\}\}/g, (_, key) => values[key] ?? `{{${key}}}`);
}

function wrapText(text: string, font: any, size: number, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split('\n')) {
    if (paragraph.trim() === '') {
      lines.push('');
      continue;
    }
    let current = '';
    for (const word of paragraph.split(' ')) {
      const candidate = current ? `${current} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) > maxWidth && current) {
        lines.push(current);
        current = word;
      } else {
        current = candidate;
      }
    }
    if (current) lines.push(current);
  }
  return lines;
}

export async function renderNdaPdf(bodyText: string, title: string): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const boldFont = await doc.embedFont(StandardFonts.HelveticaBold);
  const pageSize: [number, number] = [595.28, 841.89]; // A4
  const margin = 56;
  const fontSize = 10.5;
  const lineHeight = 15;
  const maxWidth = pageSize[0] - margin * 2;

  let page = doc.addPage(pageSize);
  let y = pageSize[1] - margin;

  page.drawText(title, { x: margin, y, size: 16, font: boldFont, color: rgb(0.05, 0.2, 0.13) });
  y -= 28;

  const lines = wrapText(bodyText, font, fontSize, maxWidth);
  for (const line of lines) {
    if (y < margin) {
      page = doc.addPage(pageSize);
      y = pageSize[1] - margin;
    }
    page.drawText(line, { x: margin, y, size: fontSize, font, color: rgb(0.1, 0.1, 0.1) });
    y -= lineHeight;
  }

  const bytes = await doc.save();
  return Buffer.from(bytes);
}
