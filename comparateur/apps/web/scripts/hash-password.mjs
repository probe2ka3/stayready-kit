#!/usr/bin/env node
/**
 * Génère la valeur de ADMIN_PASSWORD_HASH (scrypt) :
 *   node apps/web/scripts/hash-password.mjs            (saisie masquée)
 *   echo -n 'motdepasse' | node apps/web/scripts/hash-password.mjs --stdin
 */
import { randomBytes, scryptSync } from 'node:crypto';
import { createInterface } from 'node:readline';

const N = 2 ** 15;
const r = 8;
const p = 1;

function hash(password) {
  if (password.length < 12) {
    console.error('Mot de passe trop court (12 caractères minimum).');
    process.exit(1);
  }
  const salt = randomBytes(16);
  const key = scryptSync(password, salt, 32, { N, r, p, maxmem: 256 * 1024 * 1024 });
  return `scrypt$${N}$${r}$${p}$${salt.toString('base64')}$${key.toString('base64')}`;
}

if (process.argv.includes('--stdin')) {
  let data = '';
  process.stdin.on('data', (c) => (data += c));
  process.stdin.on('end', () => console.log(hash(data.replace(/\r?\n$/, ''))));
} else {
  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  rl._writeToOutput = (s) => rl.output.write(s.includes('Mot de passe') ? s : '');
  rl.question('Mot de passe administrateur : ', (pw) => {
    rl.close();
    process.stdout.write('\n');
    console.log(hash(pw));
  });
}
