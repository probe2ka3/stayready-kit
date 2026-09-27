import 'server-only';
import type { CandidateStore, CanonicalProduct, Category, Chain, LatLon, OfferIndex } from '@cabas/core';
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
import type { AppData, ChainStatus, LocalityHit } from './types';

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
  offers(canonicalIds: string[], chainIds: string[], now: Date): Promise<OfferIndex> {
    return loadOfferIndex(this.handle, canonicalIds, chainIds, now);
  }
  chainStatus(now: Date): Promise<ChainStatus[]> {
    return chainDataStatus(this.handle, now);
  }
  hasRealPrices(): Promise<boolean> {
    return this.realPricesCache.get();
  }
}

export function createPostgresAppData(url: string, ssl: boolean): PostgresAppData {
  return new PostgresAppData(createDb(url, { max: Number(process.env.DATABASE_POOL_SIZE ?? 10), ssl }));
}
