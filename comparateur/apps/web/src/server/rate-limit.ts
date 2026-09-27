import 'server-only';

/**
 * Limitation de débit à fenêtre fixe, en mémoire du processus.
 * Suffisant pour une instance ; au-delà, remplacer par un stockage partagé
 * (Redis, Upstash…) via la même interface.
 */
interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();
let lastSweep = Date.now();

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  retryAfterSec: number;
}

export function rateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  if (now - lastSweep > 60_000) {
    for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k);
    lastSweep = now;
  }
  let b = buckets.get(key);
  if (!b || b.resetAt <= now) {
    b = { count: 0, resetAt: now + windowMs };
    buckets.set(key, b);
  }
  b.count++;
  return {
    ok: b.count <= limit,
    remaining: Math.max(0, limit - b.count),
    retryAfterSec: Math.ceil((b.resetAt - now) / 1000),
  };
}

export const LIMITS = {
  compare: { limit: 30, windowMs: 60_000 },
  search: { limit: 120, windowMs: 60_000 },
  stores: { limit: 60, windowMs: 60_000 },
  login: { limit: 5, windowMs: 15 * 60_000 },
  admin: { limit: 120, windowMs: 60_000 },
} as const;
