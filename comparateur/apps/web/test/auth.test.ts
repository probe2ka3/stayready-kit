import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { verifyPassword } from '../src/server/password';
import { createSessionToken, verifySessionToken } from '../src/server/session';

const SCRIPT = join(process.cwd(), 'apps', 'web', 'scripts', 'hash-password.mjs');

describe('mots de passe (scrypt)', () => {
  const hash = execFileSync('node', [SCRIPT, '--stdin'], { input: 'un-mot-de-passe-solide' }).toString().trim();

  it('vérifie le bon mot de passe et refuse les autres', () => {
    expect(hash.startsWith('scrypt$32768$8$1$')).toBe(true);
    expect(verifyPassword('un-mot-de-passe-solide', hash)).toBe(true);
    expect(verifyPassword('un-mot-de-passe-solidE', hash)).toBe(false);
    expect(verifyPassword('', hash)).toBe(false);
  });

  it('refuse un hachage mal formé', () => {
    expect(verifyPassword('x', 'plaintext')).toBe(false);
    expect(verifyPassword('x', 'scrypt$1$1$1$AAAA$AAAA')).toBe(false);
  });
});

describe('jetons de session', () => {
  const env = { ...process.env };
  beforeEach(() => {
    process.env.SESSION_SECRET = 'x'.repeat(40);
    process.env.ADMIN_PASSWORD_HASH = 'scrypt$configured';
  });
  afterEach(() => {
    process.env = { ...env };
  });

  it('accepte un jeton valide et refuse un jeton altéré ou expiré', () => {
    const now = Date.parse('2026-09-28T10:00:00Z');
    const token = createSessionToken('admin', now);
    expect(verifySessionToken(token, now + 1000)).toEqual({ username: 'admin' });
    const [payload, sig] = token.split('.') as [string, string];
    const forged = Buffer.from(JSON.stringify({ u: 'root', exp: 9999999999 })).toString('base64url');
    expect(verifySessionToken(`${forged}.${sig}`, now)).toBeNull();
    expect(verifySessionToken(`${payload}.${sig.slice(0, -2)}xx`, now)).toBeNull();
    expect(verifySessionToken(token, now + 9 * 3600_000)).toBeNull();
  });

  it('refuse tout jeton si l’administration n’est pas configurée', () => {
    const token = createSessionToken('admin');
    delete process.env.ADMIN_PASSWORD_HASH;
    expect(verifySessionToken(token)).toBeNull();
  });

  it('refuse un secret de session trop court', () => {
    process.env.SESSION_SECRET = 'court';
    expect(verifySessionToken(createSessionToken('admin'))).toBeNull();
  });
});
