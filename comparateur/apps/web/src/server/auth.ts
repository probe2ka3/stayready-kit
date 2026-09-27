import 'server-only';
import { timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { serverEnv } from './env';
import { verifyPassword } from './password';
import { SESSION_COOKIE, SESSION_TTL_SEC, verifySessionToken } from './session';

/**
 * Authentification de l'administration.
 * - Mot de passe vérifié contre un hachage scrypt fourni par variable
 *   d'environnement (ADMIN_PASSWORD_HASH), généré par `scripts/hash-password.mjs`.
 * - Session : jeton signé (voir session.ts), cookie HttpOnly, SameSite=Strict,
 *   Secure en production, durée 8 h.
 * Sans configuration complète, l'administration reste fermée.
 */

export { adminConfigured, createSessionToken, SESSION_COOKIE, verifySessionToken } from './session';
export { verifyPassword } from './password';

export function checkCredentials(username: string, password: string): boolean {
  const userOk = Buffer.byteLength(username) === Buffer.byteLength(serverEnv.adminUsername)
    && timingSafeEqual(Buffer.from(username), Buffer.from(serverEnv.adminUsername));
  // La vérification du mot de passe est toujours effectuée (temps constant vis-à-vis du nom d'utilisateur).
  const passOk = verifyPassword(password, serverEnv.adminPasswordHash);
  return userOk && passOk;
}

export async function getAdminSession(): Promise<{ username: string } | null> {
  const store = await cookies();
  return verifySessionToken(store.get(SESSION_COOKIE)?.value);
}

/** Contrôle d'accès (couche d'accès aux données) : à appeler dans chaque page et action d'administration. */
export async function requireAdmin(): Promise<{ username: string }> {
  const session = await getAdminSession();
  if (!session) redirect('/admin/login');
  return session;
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
