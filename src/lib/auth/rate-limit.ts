// Best-effort in-process rate limiting. Netlify Functions are ephemeral, so
// this resets on cold start — it slows down casual brute-forcing within a
// warm instance but is not a durable guarantee. A durable limiter (e.g.
// backed by the database or a shared store) should replace this before the
// portal handles real production login traffic at scale.
const attempts = new Map<string, { count: number; resetAt: number }>();
const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 8;

export function isRateLimited(key: string): boolean {
  const now = Date.now();
  const entry = attempts.get(key);
  if (!entry || entry.resetAt < now) {
    attempts.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }
  entry.count += 1;
  return entry.count > MAX_ATTEMPTS;
}

export function resetRateLimit(key: string) {
  attempts.delete(key);
}
