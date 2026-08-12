import { prisma } from './db';

// Atomic per-year document numbering: CP-PRJ-2026-0001, CP-NDA-2026-0001, ...
// Single UPSERT ... ON CONFLICT statement so concurrent requests never collide.
export async function nextDocumentNumber(prefix: string): Promise<string> {
  const year = new Date().getFullYear();
  const key = `${prefix}-${year}`;

  const rows = await prisma.$queryRaw<{ value: number }[]>`
    INSERT INTO "DocumentSequence" (key, value)
    VALUES (${key}, 1)
    ON CONFLICT (key) DO UPDATE SET value = "DocumentSequence".value + 1
    RETURNING value
  `;
  const value = rows[0].value;
  return `CP-${prefix}-${year}-${String(value).padStart(4, '0')}`;
}
