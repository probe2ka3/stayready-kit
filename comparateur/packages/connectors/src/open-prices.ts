import {
  zurichLocalToInstant,
  type PriceObservation,
  type ProductAttributes,
  type Quantity,
  type RetailerProduct,
  type Store,
} from '@cabas/core';
import { PRODUCTS } from '@cabas/reference';
import { isValidGtin } from './file-import';
import { requireFetcher } from './http/fetcher';
import { matchesFor } from './matching';
import { parsePackText } from './pack';
import {
  emptyReport,
  type ConnectorBatch,
  type ConnectorContext,
  type ConnectorStatus,
  type PriceConnector,
} from './types';

/**
 * Connecteur Open Prices (Open Food Facts) — relevés communautaires justifiés (ticket de
 * caisse ou photo d'étiquette), licence ODbL 1.0. Voir docs/audit/03-sources-prix.md §3.
 *
 * - Chaque prix garde sa licence, son identifiant d'origine et le lieu du relevé.
 * - Les articles sont propres à cette source (`<enseigne>:gtin-<code>`) : jamais fusionnés
 *   avec des données d'une autre provenance.
 * - Portée : zone tarifaire de la succursale pour Migros, prix national pour les autres
 *   enseignes ; statut toujours « indicatif » (fiabilité « crowd »).
 */

export const OPEN_PRICES_API = 'https://prices.openfoodfacts.org/api/v1';
export const OPEN_PRICES_CONNECTOR_ID = 'open-prices';
export const OPEN_PRICES_LICENSE = 'ODbL-1.0';
export const OPEN_PRICES_ATTRIBUTION =
  'Prix communautaires : Open Prices (Open Food Facts), base de données sous licence ODbL 1.0';

export interface OpLocation {
  id: number;
  osm_id?: number | null;
  osm_type?: string | null;
  osm_name?: string | null;
  osm_brand?: string | null;
  osm_address_postcode?: string | null;
  osm_address_city?: string | null;
  osm_lat?: number | null;
  osm_lon?: number | null;
}

export interface OpProduct {
  code?: string | null;
  product_name?: string | null;
  brands?: string | null;
  product_quantity?: number | null;
  product_quantity_unit?: string | null;
  quantity?: string | null;
  labels_tags?: string[] | null;
}

export interface OpPrice {
  id: number;
  type?: string | null;
  product_code?: string | null;
  product_name?: string | null;
  price?: number | null;
  price_is_discounted?: boolean | null;
  price_without_discount?: number | null;
  currency?: string | null;
  date?: string | null;
  location_id?: number | null;
  duplicate_of?: number | null;
  origins_tags?: string[] | null;
  proof?: { type?: string | null } | null;
  product?: OpProduct | null;
}

/** Enseigne d'un lieu Open Prices ; null = hors périmètre (formats de proximité, pharmacies…). */
export function chainForLocation(loc: OpLocation): string | null {
  const s = `${loc.osm_brand ?? ''} ${loc.osm_name ?? ''}`.toLowerCase();
  if (/migrolino|migros restaurant|take ?away|coop pronto|coop vitality|denner express|denner satellit|prodega|transgourmet/.test(s)) {
    return null;
  }
  if (/\bmigros\b/.test(s)) return 'migros';
  if (/\bcoop\b/.test(s)) return 'coop';
  if (/\bdenner\b/.test(s)) return 'denner';
  if (/\baldi\b/.test(s)) return 'aldi';
  if (/\blidl\b/.test(s)) return 'lidl';
  if (/\botto'?s\b/.test(s)) return 'ottos';
  if (/\baligro\b/.test(s)) return 'aligro';
  if (/^action\b|\baction\s*$/.test(s.trim())) return 'action';
  return null;
}

function quantityOf(p: OpProduct | null | undefined): Quantity | null {
  if (!p) return null;
  const unit = (p.product_quantity_unit ?? '').toLowerCase();
  if (p.product_quantity && p.product_quantity > 0 && (unit === 'g' || unit === 'ml')) {
    return { amount: p.product_quantity, unit };
  }
  return p.quantity ? (parsePackText(p.quantity)?.quantity ?? null) : null;
}

function attributesOf(price: OpPrice): ProductAttributes {
  const tags = new Set([...(price.product?.labels_tags ?? [])]);
  const origins = new Set(price.origins_tags ?? []);
  const labels: string[] = [];
  if (tags.has('en:vegan')) labels.push('vegan');
  if (tags.has('en:no-lactose') || tags.has('en:lactose-free')) labels.push('lactose-free');
  if ([...tags].some((t) => /aop|pdo|protected-designation-of-origin/.test(t))) labels.push('aop');
  return {
    organic: ['en:organic', 'en:eu-organic', 'en:bio-suisse', 'fr:ab-agriculture-biologique'].some((t) => tags.has(t)),
    swissOrigin: tags.has('en:made-in-swiss') || tags.has('en:suisse-garantie') || origins.has('en:switzerland'),
    labels,
  };
}

export interface OpContext {
  now: Date;
  /** Succursales connues (identifiants `osm:<type>/<id>`) pour nommer le lieu et trouver la zone. */
  stores: Store[];
  /** Zone tarifaire d'un lieu inconnu de l'instantané (coordonnées + NPA). */
  resolveZone?: (chainId: string, lat: number, lon: number, zip?: string | null) => string | null;
  maxAgeDays: number;
}

/** Enseignes dont le prix relevé dans une succursale vaut pour la zone (et non le pays). */
const ZONAL_CHAINS = new Set(['migros']);

export function buildOpenPricesBatch(
  locations: OpLocation[],
  prices: OpPrice[],
  ctx: OpContext & Pick<ConnectorContext, 'catalog' | 'reviewedMatches'>,
): ConnectorBatch {
  const report = emptyReport();
  const storesById = new Map(ctx.stores.map((s) => [s.id, s]));
  const locById = new Map(locations.map((l) => [l.id, l]));
  const products = new Map<string, RetailerProduct>();
  const observations: PriceObservation[] = [];
  const minDate = new Date(ctx.now.getTime() - ctx.maxAgeDays * 86_400_000).toISOString().slice(0, 10);
  const skipped: Record<string, number> = {};
  const skip = (why: string) => {
    skipped[why] = (skipped[why] ?? 0) + 1;
  };

  for (const p of prices) {
    const loc = p.location_id != null ? locById.get(p.location_id) : undefined;
    const chainId = loc ? chainForLocation(loc) : null;
    if (!loc || !chainId) {
      skip('lieu hors périmètre');
      continue;
    }
    if (p.duplicate_of) {
      skip('doublon signalé');
      continue;
    }
    if (p.type !== 'PRODUCT' || !p.product_code || !isValidGtin(p.product_code)) {
      skip('sans code-barres valide');
      continue;
    }
    if (p.currency !== 'CHF') {
      skip('devise autre que CHF');
      continue;
    }
    if (!p.date || p.date < minDate || p.date > ctx.now.toISOString().slice(0, 10)) {
      skip('date hors fenêtre');
      continue;
    }
    // Prix remisé : seul le prix non remisé, s'il est indiqué, représente le prix habituel.
    const value = p.price_is_discounted ? p.price_without_discount : p.price;
    if (!value || value <= 0 || value > 1000) {
      skip(p.price_is_discounted ? 'remise sans prix normal' : 'prix invalide');
      continue;
    }
    const quantity = quantityOf(p.product);
    if (!quantity) {
      skip('contenance inconnue');
      continue;
    }
    const gtin = p.product_code;
    const id = `${chainId}:gtin-${gtin}`;
    if (!products.has(id)) {
      products.set(id, {
        id,
        chainId,
        connectorId: OPEN_PRICES_CONNECTOR_ID,
        sku: `gtin-${gtin}`,
        gtin,
        name: (p.product?.product_name || p.product_name || gtin).trim(),
        brand: p.product?.brands?.split(',')[0]?.trim() || null,
        quantity,
        attributes: attributesOf(p),
        url: `https://prices.openfoodfacts.org/products/${gtin}`,
        isDemo: false,
      });
    }
    const storeId = loc.osm_type && loc.osm_id ? `osm:${loc.osm_type.toLowerCase()}/${loc.osm_id}` : null;
    const store = storeId ? storesById.get(storeId) : undefined;
    let zoneId: string | null = null;
    if (ZONAL_CHAINS.has(chainId)) {
      zoneId =
        store?.zoneId ??
        (loc.osm_lat != null && loc.osm_lon != null ? (ctx.resolveZone?.(chainId, loc.osm_lat, loc.osm_lon, loc.osm_address_postcode) ?? null) : null);
      if (!zoneId) {
        skip('zone tarifaire inconnue');
        continue;
      }
    }
    const place = [store?.name ?? loc.osm_name ?? chainId, store?.city ?? loc.osm_address_city].filter(Boolean).join(', ');
    const proofType = (p.proof?.type ?? '').toUpperCase();
    observations.push({
      id: `${OPEN_PRICES_CONNECTOR_ID}:${p.id}`,
      retailerProductId: id,
      zoneId,
      storeId: null,
      priceCents: Math.round(value * 100),
      observedAt: zurichLocalToInstant(p.date, '12:00').toISOString(),
      source: { connectorId: OPEN_PRICES_CONNECTOR_ID, kind: 'open_data', ref: `open-prices:${p.id}` },
      isDemo: false,
      priceType: 'regular',
      channel: 'store',
      reliability: 'crowd',
      license: OPEN_PRICES_LICENSE,
      sourceUrl: `https://prices.openfoodfacts.org/prices/${p.id}`,
      observedAtPlace: place,
      proof: proofType === 'RECEIPT' ? 'receipt' : proofType === 'PRICE_TAG' ? 'price_tag' : null,
    });
  }

  const retailerProducts = [...products.values()];
  const { matches, reviewedCount } = matchesFor(retailerProducts, ctx.catalog ?? PRODUCTS, ctx.reviewedMatches);
  report.accepted = { products: retailerProducts.length, prices: observations.length, promotions: 0, matches: matches.length };
  const byChain: Record<string, number> = {};
  for (const o of observations) {
    const chain = o.retailerProductId.split(':')[0] as string;
    byChain[chain] = (byChain[chain] ?? 0) + 1;
  }
  report.metrics = {
    locations: locations.length,
    pricesRead: prices.length,
    reviewedProducts: reviewedCount,
    ...Object.fromEntries(Object.entries(byChain).map(([k, v]) => [`prices_${k}`, v])),
    ...Object.fromEntries(Object.entries(skipped).map(([k, v]) => [`skipped: ${k}`, v])),
  };
  return {
    connectorId: OPEN_PRICES_CONNECTOR_ID,
    retailerProducts,
    matches,
    prices: observations,
    promotions: [],
    report,
  };
}

export class OpenPricesConnector implements PriceConnector {
  readonly id = OPEN_PRICES_CONNECTOR_ID;
  readonly label = 'Open Prices — relevés communautaires (ODbL)';
  readonly chainIds = ['migros', 'coop', 'denner', 'aldi', 'lidl', 'ottos', 'aligro', 'action'];
  readonly sourceKind = 'open_data' as const;

  constructor(
    private readonly stores: Store[] = [],
    private readonly resolveZone?: OpContext['resolveZone'],
    private readonly api = OPEN_PRICES_API,
  ) {}

  async status(ctx: Pick<ConnectorContext, 'env'>): Promise<ConnectorStatus> {
    if (ctx.env?.OPEN_PRICES === 'off') return { state: 'disabled', message: 'Désactivé (OPEN_PRICES=off)' };
    return { state: 'ready', message: 'API publique, données ODbL' };
  }

  async run(ctx: ConnectorContext): Promise<ConnectorBatch> {
    const fetcher = requireFetcher(ctx);
    const maxAgeDays = Number(ctx.env?.OPEN_PRICES_MAX_AGE_DAYS ?? '400');
    const getJson = async <T>(path: string, params: Record<string, string | number>): Promise<T> => {
      const qs = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)])).toString();
      const r = await fetcher.get(`${this.api}${path}?${qs}`, 'application/json');
      return JSON.parse(r.body) as T;
    };
    type Page<T> = { items: T[]; pages?: number };

    const locations: OpLocation[] = [];
    for (let page = 1; page <= 50; page++) {
      const d = await getJson<Page<OpLocation>>('/locations', { osm_address_country__like: 'Schweiz', size: 100, page });
      locations.push(...d.items);
      if (page >= (d.pages ?? 1)) break;
    }
    const inScope = locations.filter((l) => chainForLocation(l));
    const since = new Date(ctx.now.getTime() - maxAgeDays * 86_400_000).toISOString().slice(0, 10);
    const prices: OpPrice[] = [];
    for (let i = 0; i < inScope.length; i += 40) {
      const ids = inScope.slice(i, i + 40).map((l) => l.id).join(',');
      for (let page = 1; page <= 100; page++) {
        const d = await getJson<Page<OpPrice>>('/prices', { location_id__in: ids, date__gte: since, size: 100, page, order_by: '-date' });
        prices.push(...d.items);
        if (page >= (d.pages ?? 1)) break;
      }
    }
    const batch = buildOpenPricesBatch(inScope, prices, {
      now: ctx.now,
      stores: this.stores,
      resolveZone: this.resolveZone,
      maxAgeDays,
      catalog: ctx.catalog,
      reviewedMatches: ctx.reviewedMatches,
    });
    batch.report.metrics = { ...batch.report.metrics, locationsCH: locations.length, locationsInScope: inScope.length };
    ctx.log.info('Open Prices : collecte terminée', batch.report.metrics);
    return batch;
  }
}
