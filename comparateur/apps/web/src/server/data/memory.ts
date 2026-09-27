import 'server-only';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  boundingBox,
  buildOfferIndex,
  haversineKm,
  normalizeText,
  zurichToday,
  type CandidateStore,
  type LatLon,
  type Locality,
  type OfferIndex,
  type Store,
} from '@cabas/core';
import { generateDemoData } from '@cabas/connectors';
import { CATEGORIES, CHAINS, PRODUCTS } from '@cabas/reference';
import type { AppData, ChainStatus, LocalityHit } from './types';

/**
 * Mode « mémoire » : aucune base de données requise. Utilise les instantanés
 * versionnés (localités swisstopo, succursales OSM) et les données de
 * démonstration générées à la volée (renouvelées chaque heure).
 * Destiné au développement, aux démonstrations et aux tests de bout en bout.
 */
export class MemoryAppData implements AppData {
  readonly mode = 'memory' as const;
  private localities: Array<Locality & { search: string }> = [];
  private stores: Store[] = [];
  private demo: { key: string; index: OfferIndex; stats: Map<string, ChainStatus> } | null = null;

  constructor(dataDir: string) {
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
    const stats = new Map<string, ChainStatus>();
    const today = zurichToday(now);
    for (const c of CHAINS) {
      stats.set(c.id, {
        chainId: c.id,
        stores: this.stores.filter((s) => s.chainId === c.id).length,
        products: 0,
        demoProducts: 0,
        realPrices: 0,
        lastObservation: null,
        activePromotions: 0,
        upcomingPromotions: 0,
      });
    }
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

  async offers(canonicalIds: string[], chainIds: string[], now: Date): Promise<OfferIndex> {
    void canonicalIds;
    void chainIds;
    return this.demoData(now).index;
  }

  async chainStatus(now: Date): Promise<ChainStatus[]> {
    return [...this.demoData(now).stats.values()];
  }

  async hasRealPrices(): Promise<boolean> {
    return false;
  }
}
