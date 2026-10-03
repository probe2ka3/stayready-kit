import 'server-only';
import { restrictedConnectorIds, type CandidateStore, type CanonicalProduct, type Category, type Chain, type LatLon, type OfferIndex } from '@cabas/core';
import {
  chainDataStatus,
  createDb,
  findStoresNear,
  listCanonicalProducts,
  listCategories,
  listChains,
  loadOfferIndex,
  searchLocalities,
  type DbHandle,
} from '@cabas/db';
import { serverEnv } from '../env';
import type { AppData, ChainStatus, CollectionInfo, LocalityHit, PriceMode } from './types';

const TTL_MS = 5 * 60_000;

/** Petit cache en mémoire pour les données de référence (quelques centaines de lignes). */
class Cached<T> {
  private value: T | null = null;
  private at = 0;
  constructor(private readonly load: () => Promise<T>) {}
  async get(): Promise<T> {
    if (this.value && Date.now() - this.at < TTL_MS) return this.value;
    this.value = await this.load();
    this.at = Date.now();
    return this.value;
  }
}

export class PostgresAppData implements AppData {
  readonly mode = 'postgres' as const;
  private readonly chainsCache: Cached<Chain[]>;
  private readonly categoriesCache: Cached<Category[]>;
  private readonly productsCache: Cached<CanonicalProduct[]>;
  private realPricesCache: Cached<boolean>;

  constructor(readonly handle: DbHandle) {
    this.chainsCache = new Cached(() => listChains(handle.db));
    this.categoriesCache = new Cached(() => listCategories(handle.db));
    this.productsCache = new Cached(() => listCanonicalProducts(handle.db));
    this.realPricesCache = new Cached(async () => {
      const rows = await handle.sql`SELECT EXISTS (SELECT 1 FROM price_observations WHERE NOT is_demo AND status = 'valid') AS e`;
      return Boolean(rows[0]?.e);
    });
  }

  chains() {
    return this.chainsCache.get();
  }
  categories() {
    return this.categoriesCache.get();
  }
  products() {
    return this.productsCache.get();
  }
  searchLocalities(query: string, limit: number): Promise<LocalityHit[]> {
    return searchLocalities(this.handle, query, limit);
  }
  storesNear(center: LatLon, radiusKm: number, chainIds?: string[] | null): Promise<CandidateStore[]> {
    return findStoresNear(this.handle, center, radiusKm, chainIds);
  }
  async offers(canonicalIds: string[], chainIds: string[], now: Date): Promise<OfferIndex> {
    return loadOfferIndex(this.handle, canonicalIds, chainIds, now, await this.priceMode(), {
      allowBenchmarkSources: serverEnv.licensedFallback,
      excludeConnectors: serverEnv.restrictSources ? restrictedConnectorIds(serverEnv.authorizedSources) : [],
    });
  }
  async priceMode(): Promise<PriceMode> {
    if (serverEnv.priceData !== 'auto') return serverEnv.priceData;
    return (await this.realPricesCache.get()) ? 'live' : 'demo';
  }
  async collections(): Promise<CollectionInfo[]> {
    const rows = await this.handle.sql<Array<{ connector_id: string; finished_at: Date | null; status: string; message: string | null; stats: Record<string, unknown> }>>`
      SELECT DISTINCT ON (connector_id) connector_id, finished_at, status, message, stats
      FROM import_runs WHERE kind = 'collect' ORDER BY connector_id, started_at DESC`;
    const excluded = serverEnv.restrictSources ? restrictedConnectorIds(serverEnv.authorizedSources) : [];
    return rows.filter((r) => !excluded.includes(r.connector_id)).map((r) => ({
      connectorId: r.connector_id,
      label: r.connector_id,
      collectedAt: r.finished_at ? new Date(r.finished_at).toISOString() : null,
      status: r.stats?.blocked ? 'blocked' : r.status,
      message: r.message,
      products: Number(r.stats?.products ?? 0),
      prices: Number(r.stats?.prices ?? 0),
      promotions: Number(r.stats?.promotions ?? 0),
      license: r.connector_id === 'open-prices' ? 'ODbL-1.0' : null,
      attribution: null,
    }));
  }
  chainStatus(now: Date): Promise<ChainStatus[]> {
    return chainDataStatus(this.handle, now, serverEnv.restrictSources ? restrictedConnectorIds(serverEnv.authorizedSources) : []);
  }
  hasRealPrices(): Promise<boolean> {
    return this.realPricesCache.get();
  }
}

export function createPostgresAppData(url: string, ssl: boolean): PostgresAppData {
  return new PostgresAppData(createDb(url, { max: Number(process.env.DATABASE_POOL_SIZE ?? 10), ssl }));
}
