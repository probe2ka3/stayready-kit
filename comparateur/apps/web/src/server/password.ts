import { scryptSync, timingSafeEqual } from 'node:crypto';

/**
 * Vérification d'un mot de passe contre un hachage scrypt.
 * Format : scrypt$N$r$p$sel_base64$hash_base64 (voir scripts/hash-password.mjs).
 */
export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [, n, r, p, saltB64, hashB64] = parts as [string, string, string, string, string, string];
  const expected = Buffer.from(hashB64, 'base64');
  if (expected.length < 16) return false;
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
