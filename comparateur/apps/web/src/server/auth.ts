import 'server-only';
import { createHmac, scryptSync, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import { serverEnv } from './env';

/**
 * Authentification de l'administration.
 * - Mot de passe vérifié contre un hachage scrypt fourni par variable
 *   d'environnement (ADMIN_PASSWORD_HASH), généré par `scripts/hash-password.mjs`.
 * - Session : jeton signé HMAC-SHA256 (SESSION_SECRET), cookie HttpOnly,
 *   SameSite=Strict, Secure en production, durée 8 h.
 * Sans configuration complète, l'administration reste fermée.
 */

export const SESSION_COOKIE = 'cabas_admin';
const SESSION_TTL_SEC = 8 * 3600;

export function adminConfigured(): boolean {
  return Boolean(serverEnv.adminPasswordHash && serverEnv.sessionSecret.length >= 32);
}

/** Format : scrypt$N$r$p$sel_base64$hash_base64 */
export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [, n, r, p, saltB64, hashB64] = parts as [string, string, string, string, string, string];
  const expected = Buffer.from(hashB64, 'base64');
  let derived: Buffer;
  try {
    derived = scryptSync(password, Buffer.from(saltB64, 'base64'), expected.length, {
      N: Number(n),
      r: Number(r),
      p: Number(p),
      maxmem: 256 * 1024 * 1024,
    });
  } catch {
    return false;
  }
  return derived.length === expected.length && timingSafeEqual(derived, expected);
}

function sign(payload: string): string {
  return createHmac('sha256', serverEnv.sessionSecret).update(payload).digest('base64url');
}

export function createSessionToken(username: string, now = Date.now()): string {
  const payload = Buffer.from(JSON.stringify({ u: username, exp: Math.floor(now / 1000) + SESSION_TTL_SEC })).toString('base64url');
  return `${payload}.${sign(payload)}`;
}

export function verifySessionToken(token: string | undefined, now = Date.now()): { username: string } | null {
  if (!token || !adminConfigured()) return null;
  const [payload, signature] = token.split('.');
  if (!payload || !signature) return null;
  const expected = sign(payload);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { u: string; exp: number };
    if (typeof data.u !== 'string' || data.exp * 1000 < now) return null;
    return { username: data.u };
  } catch {
    return null;
  }
}

export async function getAdminSession(): Promise<{ username: string } | null> {
  const store = await cookies();
  return verifySessionToken(store.get(SESSION_COOKIE)?.value);
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: serverEnv.isProduction,
    sameSite: 'strict' as const,
    path: '/',
    maxAge: SESSION_TTL_SEC,
  };
}
