import 'server-only';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

function findDataDir(): string {
  if (process.env.DATA_DIR) return resolve(process.env.DATA_DIR);
  for (const candidate of [join(process.cwd(), 'data'), join(process.cwd(), '..', '..', 'data')]) {
    if (existsSync(join(candidate, 'stores'))) return candidate;
  }
  return join(process.cwd(), 'data');
}

/**
 * Configuration serveur (variables d'environnement). Aucun secret n'est codé en dur :
 * voir `.env.example` et docs/DEPLOIEMENT.md.
 */
export const serverEnv = {
  dataBackend: (process.env.DATA_BACKEND ?? (process.env.DATABASE_URL ? 'postgres' : 'memory')) as 'postgres' | 'memory',
  databaseUrl: process.env.DATABASE_URL,
  databaseSsl: process.env.DATABASE_SSL === 'true',
  dataDir: findDataDir(),
  osrmUrl: process.env.OSRM_URL || null,
  adminUsername: process.env.ADMIN_USERNAME ?? 'admin',
  adminPasswordHash: process.env.ADMIN_PASSWORD_HASH ?? '',
  sessionSecret: process.env.SESSION_SECRET ?? '',
  trustProxy: process.env.TRUST_PROXY === 'true',
  siteUrl: (process.env.SITE_URL ?? 'http://localhost:3000').replace(/\/$/, ''),
  importDir: process.env.IMPORT_DIR ? resolve(process.env.IMPORT_DIR) : join(findDataDir(), 'imports', 'inbox'),
  isProduction: process.env.NODE_ENV === 'production',
  /** open | waitlist : verrou de lancement (voir proxy.ts). */
  publicAccess: (process.env.PUBLIC_ACCESS === 'waitlist' ? 'waitlist' : 'open') as 'open' | 'waitlist',
  /** Inscriptions à la liste d'attente (désactivées par défaut : aucune adresse collectée). */
  signupEnabled: process.env.SIGNUP_ENABLED === 'true',
  /** Cantons de la zone pilote (couverture prioritaire). */
  pilotCantons: (process.env.PILOT_CANTONS ?? 'GE,VD,NE,FR,VS,JU').split(',').map((c) => c.trim().toUpperCase()).filter(Boolean),
  /** live | demo | auto (défaut : live dès qu'un prix réel est disponible, sinon démonstration). */
  priceData: (['live', 'demo'].includes(process.env.PRICE_DATA ?? '') ? process.env.PRICE_DATA : 'auto') as 'live' | 'demo' | 'auto',
};
