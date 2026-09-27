import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Logger } from '@cabas/connectors';
import { createDb, type DbHandle } from '@cabas/db';

const here = dirname(fileURLToPath(import.meta.url));

/** Racine du projet (dossier contenant `data/`). */
export const PROJECT_ROOT = resolve(here, '..', '..', '..');

export interface WorkerEnv {
  databaseUrl: string | undefined;
  dataDir: string;
  importDir: string;
  overpassUrl: string | undefined;
  env: Record<string, string | undefined>;
}

export function readEnv(): WorkerEnv {
  const base = process.env.INIT_CWD ?? process.cwd();
  const dataDir = process.env.DATA_DIR ? resolve(base, process.env.DATA_DIR) : join(PROJECT_ROOT, 'data');
  return {
    databaseUrl: process.env.DATABASE_URL,
    dataDir,
    importDir: process.env.IMPORT_DIR ? resolve(base, process.env.IMPORT_DIR) : join(dataDir, 'imports', 'inbox'),
    overpassUrl: process.env.OVERPASS_URL,
    env: process.env,
  };
}

/** Journal structuré (JSON par ligne) — aucune donnée personnelle n'y est écrite. */
export function createLogger(scope: string): Logger {
  const write = (level: string, msg: string, data?: Record<string, unknown>) => {
    const line = JSON.stringify({ t: new Date().toISOString(), level, scope, msg, ...(data ?? {}) });
    if (level === 'error') console.error(line);
    else console.log(line);
  };
  return {
    info: (m, d) => write('info', m, d),
    warn: (m, d) => write('warn', m, d),
    error: (m, d) => write('error', m, d),
  };
}

export function requireDb(env: WorkerEnv): DbHandle {
  if (!env.databaseUrl) throw new Error('DATABASE_URL est requis pour cette tâche');
  return createDb(env.databaseUrl, { max: 4, ssl: process.env.DATABASE_SSL === 'true' });
}

export function snapshotPath(env: WorkerEnv, kind: 'localities' | 'stores'): string {
  return kind === 'localities' ? join(env.dataDir, 'geo', 'localities.json') : join(env.dataDir, 'stores', 'osm-stores.json');
}

export function hasSnapshot(env: WorkerEnv, kind: 'localities' | 'stores'): boolean {
  return existsSync(snapshotPath(env, kind));
}
