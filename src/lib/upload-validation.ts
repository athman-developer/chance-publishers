// Shared upload guardrails. Every endpoint that accepts a file must call
// this before touching storage — unrestricted size/type uploads are a real
// DoS and content-injection risk (spec Section 57: file size limits, file
// type validation).

export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024; // 25MB

export const DOCUMENT_TYPES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/rtf',
  'application/vnd.oasis.opendocument.text',
]);

export const PROOF_TYPES = new Set([...DOCUMENT_TYPES, 'image/jpeg', 'image/png', 'image/webp']);

export const IMAGE_OR_PDF_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']);

export function validateUpload(
  file: unknown,
  allowedTypes: Set<string>,
  maxBytes: number = MAX_UPLOAD_BYTES,
): { ok: true; file: File } | { ok: false; error: string } {
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: 'no-file' };
  }
  if (file.size > maxBytes) {
    return { ok: false, error: 'file-too-large' };
  }
  if (!allowedTypes.has(file.type)) {
    return { ok: false, error: 'unsupported-file-type' };
  }
  return { ok: true, file };
}
