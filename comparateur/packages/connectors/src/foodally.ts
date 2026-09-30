import { significantTokens, type PriceObservation, type ProductMatch, type RetailerProduct } from '@cabas/core';
import { ESSENTIAL_QUERIES, P1_ESSENTIALS, PRODUCTS } from '@cabas/reference';
import { requireFetcher, type PoliteFetcher } from './http/fetcher';
import { parsePackText } from './pack';
import {
  emptyReport,
  type ConnectorBatch,
  type ConnectorContext,
  type ConnectorStatus,
  type PriceConnector,
} from './types';

/**
 * FoodAlly (foodally.ch) — fournisseur de données tiers, utilisé comme **référence de comparaison**
 * (benchmark) et, seulement sur décision de l'exploitant et sous licence, comme source de repli.
 *
 * Accès : serveur MCP public `https://foodally.ch/mcp` (JSON-RPC 2.0, outil `search_products`),
 * seul chemin autorisé aux robots par le robots.txt de FoodAlly. Palier anonyme : 100 requêtes par
 * jour et 30 par minute ; au-delà, HTTP 402. Attribution obligatoire (« FoodAlly » + lien vers la
 * page source). La collecte massive du catalogue est interdite sans licence : ce connecteur ne fait
 * qu'une requête par besoin essentiel (50 au plus) et ne conserve que les résultats utiles.
 *
 * Provenance : chaque observation porte `source.kind = 'third_party'`, `connectorId = 'foodally'`,
 * le lien FoodAlly et la mention de licence ; elle n'est jamais fusionnée avec une donnée officielle
 * et reste exclue des prix affichés (`benchmarkOnly`) sauf activation explicite.
 */

export const FOODALLY_MCP_URL = 'https://foodally.ch/mcp';
export const FOODALLY_CONNECTOR_ID = 'foodally';
export const FOODALLY_LICENSE = 'FoodAlly — accès public par requête (palier anonyme), attribution obligatoire';
export const FOODALLY_ATTRIBUTION = 'Source : FoodAlly (foodally.ch)';

/** Enseignes FoodAlly → enseignes TesPrix (les autres vendeurs sont ignorés). */
const VENDOR_TO_CHAIN: Record<string, string> = {
  migros: 'migros',
  coop: 'coop',
  lidl: 'lidl',
  aldi: 'aldi',
  denner: 'denner',
  aligro: 'aligro',
};
export const FOODALLY_VENDORS = ['migros', 'coop', 'lidl', 'aldi', 'denner'];

export interface FoodAllyResult {
  id: number;
  name: string;
  vendor: string;
  priceCHF: number;
  quantity?: string | null;
  unitPriceCHF?: number | null;
  unitPriceUnit?: string | null;
  category?: string | null;
  labels?: string[] | null;
  url: string;
}

export interface FoodAllyQuery {
  slug: string;
  query: string;
  results: FoodAllyResult[];
  total: number | null;
  fetchedAt: Date;
}

export function searchRequest(query: string, id: number, vendors = FOODALLY_VENDORS, limit = 40): string {
  return JSON.stringify({ jsonrpc: '2.0', id, method: 'tools/call', params: { name: 'search_products', arguments: { query, vendors, limit } } });
}

/** Résultats structurés d'une réponse `tools/call` (champ `structuredContent`). */
export function parseSearchResponse(body: string): { results: FoodAllyResult[]; total: number | null } {
  const json = JSON.parse(body) as {
    result?: { structuredContent?: { results?: FoodAllyResult[]; total?: number } };
    error?: { message?: string };
  };
  if (json.error) throw new Error(`FoodAlly : ${json.error.message ?? 'erreur JSON-RPC'}`);
  const sc = json.result?.structuredContent;
  const results = (sc?.results ?? []).filter(
    (r) => r && typeof r.id === 'number' && typeof r.priceCHF === 'number' && r.priceCHF > 0 && typeof r.url === 'string',
  );
  return { results, total: typeof sc?.total === 'number' ? sc.total : null };
}

/** Correspondance plausible entre un résultat et la référence recherchée (suggestion, jamais validée). */
export function plausibleFor(slug: string, query: string, product: RetailerProduct): number {
  const c = PRODUCTS.find((p) => p.slug === slug);
  if (!c || c.quantity.unit !== product.quantity.unit) return 0;
  const ratio = product.quantity.amount / c.quantity.amount;
  if (ratio < 1 / 6 - 0.001 || ratio > 5) return 0;
  const q = significantTokens(query);
  const n = new Set(significantTokens(product.name));
  const hits = q.filter((t) => [...n].some((u) => u === t || (t.length >= 5 && (u.startsWith(t) || t.startsWith(u))))).length;
  if (!hits) return 0;
  const sizeScore = Math.max(0, 1 - Math.abs(Math.log(ratio)) / Math.log(6));
  return Math.round((0.7 * (hits / q.length) + 0.3 * sizeScore) * 100) / 100;
}

export function buildFoodAllyBatch(queries: FoodAllyQuery[]): ConnectorBatch {
  const report = emptyReport();
  const products = new Map<string, RetailerProduct>();
  const prices = new Map<string, PriceObservation>();
  const matches: ProductMatch[] = [];
  let unreadable = 0;
  for (const q of queries) {
    for (const r of q.results) {
      const chainId = VENDOR_TO_CHAIN[r.vendor.trim().toLowerCase()];
      if (!chainId) continue;
      const pack = parsePackText(r.quantity ?? '');
      if (!pack) {
        unreadable++;
        continue;
      }
      const id = `${chainId}:fa-${r.id}`;
      const product: RetailerProduct = {
        id,
        chainId,
        connectorId: FOODALLY_CONNECTOR_ID,
        sku: `fa-${r.id}`,
        gtin: null,
        name: r.name,
        brand: null,
        quantity: pack.quantity,
        attributes: {
          organic: (r.labels ?? []).some((l) => /\bbio\b|organic|knospe|bourgeon/i.test(l)) || /\bbio\b/i.test(r.name),
          swissOrigin: /\b(schweiz|suisse|swiss)\b/i.test(r.name),
          labels: [],
        },
        url: r.url,
        isDemo: false,
      };
      products.set(id, product);
      const day = q.fetchedAt.toISOString().slice(0, 10);
      prices.set(`${FOODALLY_CONNECTOR_ID}:${r.id}:${day}`, {
        id: `${FOODALLY_CONNECTOR_ID}:${r.id}:${day}`,
        retailerProductId: id,
        zoneId: null,
        storeId: null,
        priceCents: Math.round(r.priceCHF * 100),
        observedAt: q.fetchedAt.toISOString(),
        source: { connectorId: FOODALLY_CONNECTOR_ID, kind: 'third_party', ref: r.url },
        isDemo: false,
        priceType: 'regular',
        channel: 'online',
        reliability: 'third_party',
        license: FOODALLY_LICENSE,
        sourceUrl: r.url,
        proof: null,
      });
      const score = plausibleFor(q.slug, q.query, product);
      if (score >= 0.5) matches.push({ canonicalId: q.slug, retailerProductId: id, kind: 'similar', status: 'suggested', confidence: score });
    }
  }
  report.accepted = { products: products.size, prices: prices.size, promotions: 0, matches: matches.length };
  report.metrics = { queries: queries.length, results: queries.reduce((a, q) => a + q.results.length, 0), unreadable };
  return { connectorId: FOODALLY_CONNECTOR_ID, retailerProducts: [...products.values()], matches, prices: [...prices.values()], promotions: [], report };
}

/**
 * Exécute les requêtes (une par besoin essentiel) en respectant le quota annoncé : arrêt dès que
 * la réserve quotidienne est atteinte, au premier refus (402, 403) et au plus `maxQueries`.
 */
export async function runFoodAllyQueries(
  fetcher: PoliteFetcher,
  items: Array<{ slug: string; query: string }>,
  opts: { maxQueries?: number; dailyReserve?: number; signal?: AbortSignal } = {},
): Promise<{ queries: FoodAllyQuery[]; stoppedBy: string | null; remainingDay: number | null }> {
  const out: FoodAllyQuery[] = [];
  let remainingDay: number | null = null;
  let stoppedBy: string | null = null;
  const max = opts.maxQueries ?? 50;
  const reserve = opts.dailyReserve ?? 10;
  for (const [i, it] of items.slice(0, max).entries()) {
    if (opts.signal?.aborted) break;
    if (remainingDay !== null && remainingDay <= reserve) {
      stoppedBy = `réserve quotidienne atteinte (${remainingDay} requêtes restantes)`;
      break;
    }
    const r = await fetcher.post(FOODALLY_MCP_URL, searchRequest(it.query, i + 1), 'application/json', 'application/json, text/event-stream');
    const left = Number(r.headers?.['x-ratelimit-remaining-day']);
    if (Number.isFinite(left)) remainingDay = left;
    const { results, total } = parseSearchResponse(r.body);
    out.push({ slug: it.slug, query: it.query, results, total, fetchedAt: r.fetchedAt });
  }
  return { queries: out, stoppedBy, remainingDay };
}

export function essentialQueries(): Array<{ slug: string; query: string }> {
  return P1_ESSENTIALS.map((slug) => ({ slug, query: ESSENTIAL_QUERIES[slug].de }));
}

export class FoodAllyConnector implements PriceConnector {
  readonly id = FOODALLY_CONNECTOR_ID;
  readonly label = 'FoodAlly — fournisseur de données tiers (comparaison)';
  readonly chainIds = FOODALLY_VENDORS;
  readonly sourceKind = 'third_party' as const;

  async status(ctx: Pick<ConnectorContext, 'env'>): Promise<ConnectorStatus> {
    if (ctx.env?.FOODALLY !== 'on') {
      return { state: 'disabled', message: 'Désactivé par défaut (FOODALLY=on pour la comparaison ; repli soumis à licence)' };
    }
    return { state: 'ready', message: 'Serveur MCP public, une requête par essentiel, quota anonyme respecté' };
  }

  async run(ctx: ConnectorContext): Promise<ConnectorBatch> {
    // Un refus (402 quota, 403) remonte tel quel : la collecte s'arrête sans autre tentative.
    const { queries, stoppedBy, remainingDay } = await runFoodAllyQueries(requireFetcher(ctx), essentialQueries(), {
      maxQueries: Number(ctx.env?.FOODALLY_MAX_QUERIES ?? '50') || 50,
      dailyReserve: Number(ctx.env?.FOODALLY_DAILY_RESERVE ?? '10'),
      signal: ctx.signal,
    });
    const batch = buildFoodAllyBatch(queries);
    batch.report.metrics = { ...batch.report.metrics, remainingDay: remainingDay ?? -1, stoppedBy: stoppedBy ?? '' };
    if (stoppedBy) batch.report.warnings.push({ message: `Collecte FoodAlly interrompue : ${stoppedBy}` });
    ctx.log.info('FoodAlly : requêtes terminées', batch.report.metrics);
    return batch;
  }
}
