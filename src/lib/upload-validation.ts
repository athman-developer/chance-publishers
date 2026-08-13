// Shared upload guardrails. Every endpoint that accepts a file must call
// this before touching storage — unrestricted size/type uploads are a real
// DoS and content-injection risk (spec Section 57: file size limits, file
// type validation).

// Netlify Functions (which power every SSR route here) hard-reject request
// bodies above ~6MB before our code ever runs — a raw platform 413, not
// something validateUpload() can catch or return a friendly error for.
// Kept well under that ceiling to leave room for multipart overhead and
// other form fields in the same request.
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024; // 4MB

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
