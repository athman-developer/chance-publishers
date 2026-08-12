import { mkdir, readFile, writeFile, unlink } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { StorageAdapter } from './index';

const ROOT = join(process.cwd(), '.private-storage');

function pathFor(key: string) {
  // Keys are always generated server-side (never raw user input), but guard
  // against path traversal regardless.
  const safeKey = key.replace(/\.\./g, '');
  return join(ROOT, safeKey);
}

export const localStorageAdapter: StorageAdapter = {
  async put(key, data, contentType) {
    const filePath = pathFor(key);
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, data);
    await writeFile(`${filePath}.meta.json`, JSON.stringify({ contentType }));
  },
  async get(key) {
    try {
      const filePath = pathFor(key);
      const data = await readFile(filePath);
      const meta = JSON.parse(await readFile(`${filePath}.meta.json`, 'utf-8'));
      return { data, contentType: meta.contentType };
    } catch {
      return null;
    }
  },
  async delete(key) {
    const filePath = pathFor(key);
    await unlink(filePath).catch(() => {});
    await unlink(`${filePath}.meta.json`).catch(() => {});
  },
};
