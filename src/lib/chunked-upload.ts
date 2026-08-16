import { getStorage } from './storage';

// 4MB chunks keep each request safely under Netlify Functions' ~6MB hard
// body ceiling. 3 chunks gives headroom for a 10MB file after overhead.
export const MAX_CHUNKS = 3;

export function chunkKey(scope: string, ownerId: string, uploadId: string, index: number) {
  return `_chunks/${scope}/${ownerId}/${uploadId}/${index}`;
}

export function validChunkParams(uploadId: string, chunkIndex: number, totalChunks: number) {
  return /^[a-zA-Z0-9-]{1,64}$/.test(uploadId) &&
    Number.isInteger(chunkIndex) && Number.isInteger(totalChunks) &&
    totalChunks >= 1 && totalChunks <= MAX_CHUNKS &&
    chunkIndex >= 0 && chunkIndex < totalChunks;
}

export async function storeChunk(key: string, chunk: File) {
  const storage = await getStorage();
  const buffer = Buffer.from(await chunk.arrayBuffer());
  await storage.put(key, buffer, 'application/octet-stream');
}

export async function assembleChunks(
  scope: string,
  ownerId: string,
  uploadId: string,
  totalChunks: number,
  maxBytes: number,
): Promise<{ ok: true; buffer: Buffer } | { ok: false; error: string }> {
  const storage = await getStorage();
  const keys: string[] = [];
  const parts: Buffer[] = [];
  let totalSize = 0;

  for (let i = 0; i < totalChunks; i++) {
    const key = chunkKey(scope, ownerId, uploadId, i);
    const result = await storage.get(key);
    if (!result) return { ok: false, error: 'missing-chunk' };
    parts.push(result.data);
    totalSize += result.data.length;
    keys.push(key);
  }

  if (totalSize === 0 || totalSize > maxBytes) {
    await Promise.all(keys.map((k) => storage.delete(k)));
    return { ok: false, error: 'file-too-large' };
  }

  await Promise.all(keys.map((k) => storage.delete(k)));
  return { ok: true, buffer: Buffer.concat(parts) };
}

export function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}
