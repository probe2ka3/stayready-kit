import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Jeton de session de l'administration : charge utile JSON encodée + signature
 * HMAC-SHA256 (SESSION_SECRET). Fonctions pures, utilisables dans `proxy.ts`.
 */

export const SESSION_COOKIE = 'cabas_admin';
export const SESSION_TTL_SEC = 8 * 3600;

function secret(): string {
  return process.env.SESSION_SECRET ?? '';
}

export function adminConfigured(): boolean {
  return Boolean(process.env.ADMIN_PASSWORD_HASH && secret().length >= 32);
}

function sign(payload: string): string {
  return createHmac('sha256', secret()).update(payload).digest('base64url');
}

export function createSessionToken(username: string, now = Date.now()): string {
  const payload = Buffer.from(JSON.stringify({ u: username, exp: Math.floor(now / 1000) + SESSION_TTL_SEC })).toString('base64url');
  return `${payload}.${sign(payload)}`;
}

export function verifySessionToken(token: string | undefined, now = Date.now()): { username: string } | null {
  if (!token || !adminConfigured()) return null;
  const [payload, signature] = token.split('.');
  if (!payload || !signature) return null;
  const a = Buffer.from(signature);
  const b = Buffer.from(sign(payload));
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { u: string; exp: number };
    if (typeof data.u !== 'string' || data.exp * 1000 < now) return null;
    return { username: data.u };
  } catch {
    return null;
  }
}
