import 'server-only';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import {
  boundingBox,
  buildOfferIndex,
  haversineKm,
  normalizeText,
  reliabilityOf,
  zurichToday,
  type CandidateStore,
  type LatLon,
  type Locality,
  type OfferIndex,
  type Store,
} from '@cabas/core';
import {
  generateDemoData,
  liveSnapshotDir,
  matchesFor,
  readLiveSnapshots,
  readReviewedMatches,
  reviewedMatchesPath,
  type LiveSnapshot,
} from '@cabas/connectors';
import { CATEGORIES, CHAINS, PRODUCTS } from '@cabas/reference';
import { serverEnv } from '../env';
import type { AppData, ChainStatus, CollectionInfo, LocalityHit, PriceMode } from './types';

interface LiveState {
  key: string;
  index: OfferIndex;
  stats: Map<string, ChainStatus>;
  snapshots: LiveSnapshot[];
}

function mtimeKey(paths: string[]): string {
  return paths
    .map((p) => {
      try {
        return `${p}:${statSync(p).mtimeMs}`;
      } catch {
        return `${p}:-`;
      }
    })
    .join('|');
}

/**
 * Mode « mémoire » : aucune base de données requise. Utilise les instantanés
 * versionnés (localités swisstopo, succursales OSM) et, selon PRICE_DATA :
 * - live : les prix réels du dernier instantané de collecte (`data/prices/live/`) ;
 * - demo : des données de démonstration générées à la volée (renouvelées chaque heure).
 * Les deux ne sont jamais mélangés.
 */
export class MemoryAppData implements AppData {
  readonly mode = 'memory' as const;
  private localities: Array<Locality & { search: string }> = [];
  private stores: Store[] = [];
  private demo: { key: string; index: OfferIndex; stats: Map<string, ChainStatus> } | null = null;
  private live: LiveState | null = null;
  private liveCheckedAt = 0;

  constructor(private readonly dataDir: string) {
    const loc = JSON.parse(readFileSync(join(dataDir, 'geo', 'localities.json'), 'utf8')) as {
      rows: Array<[string, string, string, string, string, number, number, string]>;
    };
    this.localities = loc.rows.map(([zip, suffix, name, municipality, canton, lat, lon, lang]) => ({
      zip,
      suffix,
      name,
      municipality,
      canton,
      lat,
      lon,
      lang,
      search: normalizeText(`${zip} ${name} ${municipality}`),
    }));
    const st = JSON.parse(readFileSync(join(dataDir, 'stores', 'osm-stores.json'), 'utf8')) as { stores: Store[] };
    this.stores = st.stores;
  }

  async chains() {
    return CHAINS;
  }

  async categories() {
    return CATEGORIES;
  }

  async products() {
    return PRODUCTS;
  }

  async searchLocalities(query: string, limit: number): Promise<LocalityHit[]> {
    const q = normalizeText(query);
    if (!q) return [];
    const zip = /^\d{1,4}/.exec(q)?.[0];
    const rest = q.replace(/^\d{1,4}\s*/, '');
    const hits = this.localities.filter((l) =>
      zip ? l.zip.startsWith(zip) && (!rest || l.search.includes(rest)) : l.search.includes(q),
    );
    const score = (l: (typeof hits)[number]) =>
      zip ? 0 : (normalizeText(l.name) === q ? 0 : 1) + (normalizeText(l.name).startsWith(q) ? 0 : 1);
    return hits
      .sort((a, b) => score(a) - score(b) || a.zip.localeCompare(b.zip) || a.name.localeCompare(b.name, 'fr'))
      .slice(0, limit)
      .map(({ search: _s, ...l }) => ({ ...l, label: `${l.zip} ${l.name} (${l.canton})` }));
  }

  async storesNear(center: LatLon, radiusKm: number, chainIds?: string[] | null): Promise<CandidateStore[]> {
    const box = boundingBox(center, radiusKm);
    const allowed = chainIds && chainIds.length ? new Set(chainIds) : null;
    return this.stores
      .filter(
        (s) =>
          s.lat >= box.minLat &&
          s.lat <= box.maxLat &&
          s.lon >= box.minLon &&
          s.lon <= box.maxLon &&
          (!allowed || allowed.has(s.chainId)),
      )
      .map((s) => ({ ...s, crowKm: haversineKm(center, s) }))
      .filter((s) => s.crowKm <= radiusKm)
      .sort((a, b) => a.crowKm - b.crowKm);
  }

  private demoData(now: Date) {
    // Régénération horaire : nouvelles promotions publiées, dates de vérification à jour.
    const key = `${zurichToday(now)}T${now.getUTCHours()}`;
    if (this.demo?.key === key) return this.demo;
    const { batch } = generateDemoData(now);
    const index = buildOfferIndex({
      products: batch.retailerProducts,
      matches: batch.matches,
      prices: batch.prices,
      promotions: batch.promotions,
    });
    const stats = this.emptyStats();
    const today = zurichToday(now);
    for (const p of batch.retailerProducts) {
      const s = stats.get(p.chainId);
      if (s) {
        s.products++;
        s.demoProducts++;
      }
    }
    for (const o of batch.prices) {
      const s = stats.get(index.products.get(o.retailerProductId)?.chainId ?? '');
      if (s && (!s.lastObservation || o.observedAt > s.lastObservation)) s.lastObservation = o.observedAt;
    }
    for (const p of batch.promotions) {
      const s = stats.get(p.chainId);
      if (!s) continue;
      if (p.validFrom <= today && p.validTo >= today) s.activePromotions++;
      else if (p.validFrom > today) s.upcomingPromotions++;
    }
    this.demo = { key, index, stats };
    return this.demo;
  }

  /** Prix réels : relus lorsque les instantanés changent (contrôle au plus toutes les 30 s). */
  private async liveData(now: Date): Promise<LiveState | null> {
    if (this.live && Date.now() - this.liveCheckedAt < 30_000) return this.live;
    this.liveCheckedAt = Date.now();
    const dir = liveSnapshotDir(this.dataDir);
    const files = readdirSafe(dir).map((f) => join(dir, f));
    const key = `${mtimeKey([...files, reviewedMatchesPath(this.dataDir)])}|${zurichToday(now)}`;
    if (this.live?.key === key) return this.live;
    const snapshots = await readLiveSnapshots(this.dataDir);
    if (snapshots.length === 0) {
      this.live = null;
      return null;
    }
    const reviewed = await readReviewedMatches(this.dataDir);
    const products = snapshots.flatMap((s) => s.batch.retailerProducts);
    const prices = snapshots.flatMap((s) => s.batch.prices);
    const promotions = snapshots.flatMap((s) => s.batch.promotions);
    // Correspondances recalculées à chaque lecture : une revue prend effet sans nouvelle collecte.
    const { matches } = matchesFor(products, PRODUCTS, reviewed);
    const index = buildOfferIndex({ products, matches, prices, promotions }, { allowBenchmarkSources: serverEnv.licensedFallback });
    const stats = this.emptyStats();
    const today = zurichToday(now);
    for (const p of products) {
      const s = stats.get(p.chainId);
      if (s) s.products++;
    }
    for (const o of prices) {
      const s = stats.get(index.products.get(o.retailerProductId)?.chainId ?? products.find((p) => p.id === o.retailerProductId)?.chainId ?? '');
      if (!s) continue;
      s.realPrices++;
      if (!s.lastObservation || o.observedAt > s.lastObservation) s.lastObservation = o.observedAt;
      if (reliabilityOf(o) === 'official') {
        s.officialPrices++;
        if (!s.lastOfficialObservation || o.observedAt > s.lastOfficialObservation) s.lastOfficialObservation = o.observedAt;
      }
    }
    for (const p of promotions) {
      const s = stats.get(p.chainId);
      if (!s) continue;
      if (p.validFrom <= today && p.validTo >= today) s.activePromotions++;
      else if (p.validFrom > today) s.upcomingPromotions++;
    }
    this.live = { key, index, stats, snapshots };
    return this.live;
  }

  private emptyStats(): Map<string, ChainStatus> {
    const stats = new Map<string, ChainStatus>();
    for (const c of CHAINS) {
      stats.set(c.id, {
        chainId: c.id,
        stores: this.stores.filter((s) => s.chainId === c.id).length,
        products: 0,
        demoProducts: 0,
        realPrices: 0,
        officialPrices: 0,
        lastObservation: null,
        lastOfficialObservation: null,
        activePromotions: 0,
        upcomingPromotions: 0,
      });
    }
    return stats;
  }

  async priceMode(now: Date): Promise<PriceMode> {
    if (serverEnv.priceData !== 'auto') return serverEnv.priceData;
    return (await this.liveData(now)) ? 'live' : 'demo';
  }

  async offers(canonicalIds: string[], chainIds: string[], now: Date): Promise<OfferIndex> {
    void canonicalIds;
    void chainIds;
    if ((await this.priceMode(now)) === 'live') {
      const live = await this.liveData(now);
      return live?.index ?? buildOfferIndex({ products: [], matches: [], prices: [], promotions: [] });
    }
    return this.demoData(now).index;
  }

  async chainStatus(now: Date): Promise<ChainStatus[]> {
    if ((await this.priceMode(now)) === 'live') {
      return [...((await this.liveData(now))?.stats ?? this.emptyStats()).values()];
    }
    return [...this.demoData(now).stats.values()];
  }

  async hasRealPrices(now: Date): Promise<boolean> {
    const live = await this.liveData(now);
    return Boolean(live && live.snapshots.some((s) => s.batch.prices.length > 0 || s.batch.promotions.length > 0));
  }

  async collections(): Promise<CollectionInfo[]> {
    const live = await this.liveData(new Date());
    return (live?.snapshots ?? []).map((s) => ({
      connectorId: s.connectorId,
      label: s.label,
      collectedAt: s.collectedAt,
      status: s.status,
      message: s.message,
      products: s.batch.retailerProducts.length,
      prices: s.batch.prices.length,
      promotions: s.batch.promotions.length,
      license: s.license,
      attribution: s.attribution,
    }));
  }
}

function readdirSafe(dir: string): string[] {
  return existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.json')) : [];
}
