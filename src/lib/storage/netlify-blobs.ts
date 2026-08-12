import { getStore } from '@netlify/blobs';
import type { StorageAdapter } from './index';

const STORE_NAME = 'chance-publishers-private-files';

export const netlifyBlobsAdapter: StorageAdapter = {
  async put(key, data, contentType) {
    const store = getStore(STORE_NAME);
    await store.set(key, data, { metadata: { contentType } });
  },
  async get(key) {
    const store = getStore(STORE_NAME);
    const result = await store.getWithMetadata(key, { type: 'arrayBuffer' });
    if (!result) return null;
    const contentType = (result.metadata?.contentType as string) || 'application/octet-stream';
    return { data: Buffer.from(result.data), contentType };
  },
  async delete(key) {
    const store = getStore(STORE_NAME);
    await store.delete(key);
  },
};
