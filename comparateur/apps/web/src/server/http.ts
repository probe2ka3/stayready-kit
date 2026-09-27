import 'server-only';
import { createHash } from 'node:crypto';
import { NextResponse } from 'next/server';
import { serverEnv } from './env';
import { LIMITS, rateLimit } from './rate-limit';

/**
 * Identifiant de client pour la limitation de débit. L'adresse IP n'est jamais
 * journalisée ni stockée : seule une empreinte tronquée est gardée en mémoire.
 */
export function clientKey(req: Request): string {
  let ip = 'unknown';
  if (serverEnv.trustProxy) {
    ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'unknown';
  }
  return createHash('sha256').update(`${ip}|${serverEnv.sessionSecret}`).digest('base64url').slice(0, 16);
}

export function jsonError(status: number, code: string, message: string, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ error: { code, message, ...extra } }, { status });
}

export function limitOr429(req: Request, kind: keyof typeof LIMITS): NextResponse | null {
  const { limit, windowMs } = LIMITS[kind];
  const r = rateLimit(`${kind}:${clientKey(req)}`, limit, windowMs);
  if (r.ok) return null;
  const res = jsonError(429, 'rate_limited', 'Trop de requêtes. Réessayez dans un instant.');
  res.headers.set('Retry-After', String(r.retryAfterSec));
  return res;
}

/** Refuse les requêtes d'écriture provenant d'une autre origine (protection CSRF). */
export function sameOrigin(req: Request): boolean {
  const origin = req.headers.get('origin');
  if (!origin) return req.method === 'GET' || req.method === 'HEAD';
  try {
    const o = new URL(origin);
    // X-Forwarded-Host n'est pris en compte que derrière un proxy de confiance.
    const host = (serverEnv.trustProxy ? req.headers.get('x-forwarded-host') : null) ?? req.headers.get('host');
    return o.host === host;
  } catch {
    return false;
  }
}

export async function readJson(req: Request, maxBytes = 64_000): Promise<unknown> {
  const len = Number(req.headers.get('content-length') ?? '0');
  if (len > maxBytes) throw new Error('payload_too_large');
  const text = await req.text();
  if (text.length > maxBytes) throw new Error('payload_too_large');
  return JSON.parse(text);
}
