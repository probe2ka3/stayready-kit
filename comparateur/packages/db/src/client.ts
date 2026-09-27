import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres, { type Sql } from 'postgres';
import * as schema from './schema';

export type Database = PostgresJsDatabase<typeof schema>;

export interface DbHandle {
  db: Database;
  sql: Sql;
  close(): Promise<void>;
}

export interface DbOptions {
  /** Taille du pool de connexions. */
  max?: number;
  /** Exiger TLS (recommandé en production hors réseau privé). */
  ssl?: boolean;
}

export function createDb(url: string, opts: DbOptions = {}): DbHandle {
  if (!url) throw new Error('DATABASE_URL manquant');
  const client = postgres(url, {
    max: opts.max ?? 10,
    ssl: opts.ssl ? 'require' : undefined,
    onnotice: () => {},
    idle_timeout: 30,
    connect_timeout: 10,
  });
  const db = drizzle(client, { schema });
  return { db, sql: client, close: () => client.end({ timeout: 5 }) };
}

export const MIGRATIONS_FOLDER = join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations');

/** Applique les migrations SQL versionnées (idempotent). */
export async function runMigrations(url: string): Promise<void> {
  const client = postgres(url, { max: 1, onnotice: () => {} });
  try {
    await migrate(drizzle(client), { migrationsFolder: MIGRATIONS_FOLDER });
  } finally {
    await client.end({ timeout: 5 });
  }
}

/** Découpe un tableau en paquets (limite de paramètres PostgreSQL). */
export function chunk<T>(items: T[], size = 500): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
