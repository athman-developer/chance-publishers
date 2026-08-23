// Login rate limiting backed by Netlify Blobs so it survives across
// function cold starts (an in-memory Map resets every time and gives an
// attacker a fresh allowance on almost every request in production).
import { getStorage } from '../storage';

const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 8;

function blobKey(key: string) {
  return `_rate-limit/login/${Buffer.from(key).toString('base64url')}`;
}

export async function isRateLimited(key: string): Promise<boolean> {
  const storage = await getStorage();
  const now = Date.now();
  const existing = await storage.get(blobKey(key));

  let entry: { count: number; resetAt: number };
  if (existing) {
    try {
      entry = JSON.parse(existing.data.toString('utf-8'));
    } catch {
      entry = { count: 0, resetAt: now + WINDOW_MS };
    }
  } else {
    entry = { count: 0, resetAt: now + WINDOW_MS };
  }

  if (entry.resetAt < now) {
    entry = { count: 0, resetAt: now + WINDOW_MS };
  }

  entry.count += 1;
  await storage.put(blobKey(key), Buffer.from(JSON.stringify(entry)), 'application/json');

  return entry.count > MAX_ATTEMPTS;
}

export async function resetRateLimit(key: string): Promise<void> {
  const storage = await getStorage();
  await storage.delete(blobKey(key));
}
