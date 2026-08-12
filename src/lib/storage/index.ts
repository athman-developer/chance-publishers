// Private file storage abstraction. Manuscripts, signed NDAs, invoices etc.
// must never live in public/ — everything here is fetched through an
// authenticated download route, never a direct public URL.
//
// Provider is chosen at runtime: Netlify Blobs in production (already
// available on this Netlify account at no extra cost), local filesystem in
// dev. A Cloudflare R2 (or any S3-compatible) adapter can be dropped in
// later behind this same interface without touching calling code.

export interface StorageAdapter {
  put(key: string, data: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<{ data: Buffer; contentType: string } | null>;
  delete(key: string): Promise<void>;
}

let adapterPromise: Promise<StorageAdapter> | null = null;

async function loadAdapter(): Promise<StorageAdapter> {
  if (import.meta.env.DEV) {
    const { localStorageAdapter } = await import('./local');
    return localStorageAdapter;
  }
  const { netlifyBlobsAdapter } = await import('./netlify-blobs');
  return netlifyBlobsAdapter;
}

export function getStorage(): Promise<StorageAdapter> {
  if (!adapterPromise) adapterPromise = loadAdapter();
  return adapterPromise;
}
