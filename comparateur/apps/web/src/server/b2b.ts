import 'server-only';
import { createHash, timingSafeEqual } from 'node:crypto';
import { buildPriceRecords, DEFAULT_FRESHNESS, type PriceRecord } from '@cabas/core';
import { readLiveDataSet } from '@cabas/connectors';
import { PRODUCTS } from '@cabas/reference';
import { serverEnv } from './env';

/**
 * API de données agrégées pour les clients professionnels (docs/BUSINESS_MODEL_V2.md §4).
 * Fermée par défaut : ouverte seulement si des clés sont configurées (`B2B_API_KEY_HASHES` =
 * empreintes SHA-256 hexadécimales, séparées par des virgules). Aucune donnée personnelle.
 */
function keyHashes(): Buffer[] {
  return (process.env.B2B_API_KEY_HASHES ?? '')
    .split(',')
    .map((h) => h.trim().toLowerCase())
    .filter((h) => /^[0-9a-f]{64}$/.test(h))
    .map((h) => Buffer.from(h, 'hex'));
}

export function b2bEnabled(): boolean {
  return keyHashes().length > 0;
}

export function authenticate(req: Request): boolean {
  const hashes = keyHashes();
  if (hashes.length === 0) return false;
  const m = /^Bearer\s+(\S{24,200})$/.exec(req.headers.get('authorization') ?? '');
  if (!m) return false;
  const h = createHash('sha256').update(m[1] as string).digest();
  return hashes.some((k) => k.length === h.length && timingSafeEqual(k, h));
}

let cache: { at: number; records: PriceRecord[] } | null = null;

/** Observations enrichies (instantanés réels, correspondances revues), mises en cache 10 minutes. */
export async function b2bRecords(now = new Date()): Promise<PriceRecord[]> {
  if (cache && now.getTime() - cache.at < 600_000) return cache.records;
  const { data } = await readLiveDataSet(serverEnv.dataDir, PRODUCTS);
  const records = buildPriceRecords(data, now, DEFAULT_FRESHNESS);
  cache = { at: now.getTime(), records };
  return records;
}

export function unauthorized() {
  return Response.json(
    { error: { code: b2bEnabled() ? 'unauthorized' : 'not_open', message: b2bEnabled() ? 'Clé API requise' : 'API professionnelle non ouverte' } },
    { status: b2bEnabled() ? 401 : 403 },
  );
}
