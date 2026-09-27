import 'server-only';
import { serverEnv } from '../env';
import { MemoryAppData } from './memory';
import { createPostgresAppData, type PostgresAppData } from './postgres';
import type { AppData } from './types';

const globalKey = Symbol.for('cabas.appData');
type GlobalWithData = typeof globalThis & { [globalKey]?: AppData };

/** Instance unique (conservée entre rechargements à chaud en développement). */
export function getAppData(): AppData {
  const g = globalThis as GlobalWithData;
  if (!g[globalKey]) {
    if (serverEnv.dataBackend === 'postgres') {
      if (!serverEnv.databaseUrl) throw new Error('DATA_BACKEND=postgres mais DATABASE_URL est absent');
      g[globalKey] = createPostgresAppData(serverEnv.databaseUrl, serverEnv.databaseSsl);
    } else {
      g[globalKey] = new MemoryAppData(serverEnv.dataDir);
    }
  }
  return g[globalKey] as AppData;
}

/** Accès aux fonctions d'administration (PostgreSQL uniquement). */
export function getPostgresData(): PostgresAppData | null {
  const data = getAppData();
  return data.mode === 'postgres' ? (data as PostgresAppData) : null;
}

export type { AppData, ChainStatus, LocalityHit } from './types';
