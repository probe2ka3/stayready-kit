import {
  addDays,
  zurichToday,
  type PriceObservation,
  type Promotion,
  type RetailerProduct,
} from '@cabas/core';
import { PRODUCTS } from '@cabas/reference';
import { HttpBlockedError, requireFetcher } from './http/fetcher';
import { labelsFromName, SWISS_NAME } from './lidl';
import { matchesFor } from './matching';
import { parsePackText, unitPriceDeviation } from './pack';
import {
  emptyReport,
  type ConnectorBatch,
  type ConnectorContext,
  type ConnectorStatus,
  type PriceConnector,
} from './types';

/**
 * Connecteur Aldi Suisse — API publique de recherche d'articles consommée par le site officiel
 * (voir docs/DATA_SURFACES.md §3).
 *
 * `GET https://api.aldi-suisse.ch/v3/product-search?currency=CHF&serviceType=walk-in&limit=60&offset=N`
 * renvoie l'assortiment en magasin (prix national) avec contenance, prix de base, prix « au lieu de »
 * et date de mise en vente des actions (y compris les actions annoncées à l'avance).
 *
 * Règles : liste paginée uniquement (la recherche plein texte `q=` est refusée par l'hôte et n'est
 * jamais utilisée), 60 articles par requête, délai du client poli, arrêt au premier refus.
 * Seuls des faits sont conservés (désignation, marque, contenance, prix, dates, numéro d'article).
 */

export const ALDI_API_ORIGIN = 'https://api.aldi-suisse.ch';
export const ALDI_WWW_ORIGIN = 'https://www.aldi-suisse.ch';
export const ALDI_CONNECTOR_ID = 'aldi-api';
/** Tailles de page acceptées par l'API : 12, 16, 24, 30, 32, 48, 60. */
export const ALDI_PAGE_SIZE = 60;
/** Décalage maximal accepté par le site (WEB_MAX_PRODUCTS_OFFSET). */
export const ALDI_MAX_OFFSET = 9999;
/** Catégorie « Actions » (articles temporaires, dont actions annoncées). */
export const ALDI_ACTIONS_CATEGORY = '1588161418433031';

export function aldiSearchUrl(offset: number, limit = ALDI_PAGE_SIZE): string {
  return `${ALDI_API_ORIGIN}/v3/product-search?currency=CHF&serviceType=walk-in&limit=${limit}&offset=${offset}`;
}

/** Page publique de l'article (lien pour l'utilisateur). */
export function aldiProductUrl(slug: string, sku: string): string {
  return `${ALDI_WWW_ORIGIN}/fr/produit/${slug}-${sku}`;
}

/* ------------------------------------------------------------------ */
/* Réponse de l'API                                                    */
/* ------------------------------------------------------------------ */

export interface AldiApiPrice {
  amount?: number | null;
  amountRelevant?: number | null;
  comparison?: number | null;
  comparisonDisplay?: string | null;
  wasPriceDisplay?: string | null;
  savingsDisplay?: string | null;
  bottleDeposit?: number | null;
  currencyCode?: string | null;
}

export interface AldiApiItem {
  sku: string;
  name: string;
  brandName?: string | null;
  urlSlugText?: string | null;
  discontinued?: boolean;
  sellingSize?: string | null;
  quantityUnit?: string | null;
  weightType?: string | null;
  onSaleDate?: string | null;
  onSaleDateDisplay?: string | null;
  price?: AldiApiPrice | null;
  categories?: Array<{ id: string; name: string }> | null;
  badges?: Array<{ items?: Array<{ alt?: string | null; displayText?: string | null }> }> | null;
}

export interface AldiApiPage {
  meta?: { pagination?: { offset?: number; limit?: number; totalCount?: number } };
  data?: AldiApiItem[];
}

/** Catégories hors périmètre alimentaire et ménager (actions non alimentaires). */
const NON_GROCERY_CATEGORY =
  /(v[êe]tements|jardin|jouets|[ée]clairage|appareils [ée]lectroniques|voiture|piles|livres|fournitures de bureau|d[ée]coration|linge de maison|valises|outdoor|plantes et fleurs|^cuisine$|^produits pour animaux$)/i;

/**
 * Article alimentaire ou ménager. Un article rangé uniquement dans « Actions » (sans rayon) est
 * conservé : il ne sera rapproché du catalogue qu'après revue.
 */
export function isGroceryItem(item: AldiApiItem): boolean {
  const specific = (item.categories ?? []).filter((c) => c.id !== ALDI_ACTIONS_CATEGORY);
  if (specific.length === 0) return true;
  return specific.some((c) => !NON_GROCERY_CATEGORY.test(c.name.trim()));
}

/** « CHF 3.79 » → 379. */
export function chfToCents(text: string | null | undefined): number | null {
  if (!text) return null;
  const m = /(\d+)[.,](\d{2})/.exec(text.replace(/ /g, ' '));
  return m ? Number(m[1]) * 100 + Number(m[2]) : null;
}

/** « CHF 0.44/100 g » → texte « 100 g = 0.44 » lisible par `unitPriceDeviation`. */
export function comparisonAsBasis(display: string | null | undefined): string | null {
  if (!display) return null;
  const m = /(\d+[.,]\d{2})\s*\/\s*(\d+(?:[.,]\d+)?)?\s*(kg|g|ml|cl|dl|l)\b/i.exec(display.replace(/ /g, ' '));
  if (!m) return null;
  return `${m[2] ?? '1'} ${m[3]} = ${m[1]}`;
}

export interface AldiItemFacts {
  sku: string;
  name: string;
  brand: string | null;
  slug: string;
  packText: string;
  priceCents: number;
  wasPriceCents: number | null;
  savingsText: string | null;
  comparisonBasis: string | null;
  isAction: boolean;
  onSaleDate: string | null;
  organic: boolean;
  swiss: boolean;
  categories: string[];
}

export function itemFacts(item: AldiApiItem): AldiItemFacts | null {
  const price = item.price ?? {};
  const cents = price.amountRelevant ?? price.amount ?? null;
  if (!item.sku || !item.name || typeof cents !== 'number' || cents <= 0) return null;
  if (price.currencyCode && price.currencyCode !== 'CHF') return null;
  const badges = (item.badges ?? []).flatMap((b) => b.items ?? []).map((i) => `${i.alt ?? ''} ${i.displayText ?? ''}`).join(' ');
  const cats = item.categories ?? [];
  const was = chfToCents(price.wasPriceDisplay);
  const brand = item.brandName?.trim() || null;
  return {
    sku: item.sku,
    name: item.name.trim(),
    brand,
    slug: item.urlSlugText ?? '',
    packText: item.sellingSize ?? '',
    priceCents: cents,
    wasPriceCents: was && was > cents ? was : null,
    savingsText: price.savingsDisplay?.trim() || null,
    comparisonBasis: comparisonAsBasis(price.comparisonDisplay),
    isAction: cats.some((c) => c.id === ALDI_ACTIONS_CATEGORY) || Boolean(item.onSaleDate),
    onSaleDate: item.onSaleDate && /^\d{4}-\d{2}-\d{2}$/.test(item.onSaleDate) ? item.onSaleDate : null,
    // Marque propre « BIO » (et « BIO NATURA ») : produits biologiques certifiés.
    organic: /\bbio\b/i.test(item.name) || /^bio\b/i.test(brand ?? '') || cats.some((c) => /\(bio\)/i.test(c.name)) || /\bbio\b|organic/i.test(badges),
    // Ligne « SAVEURS SUISSES » : produits suisses d'Aldi.
    swiss: SWISS_NAME.test(item.name) || /^saveurs suisses$/i.test(brand ?? '') || /suisse garantie|swiss|schweiz/i.test(badges),
    categories: cats.map((c) => c.name),
  };
}

/* ------------------------------------------------------------------ */
/* Lot                                                                 */
/* ------------------------------------------------------------------ */

export interface AldiPages {
  pages: Array<{ url: string; json: AldiApiPage; fetchedAt: Date }>;
}

/** Transforme les réponses lues en lot (pur, testable hors ligne). */
export function buildAldiBatch(input: AldiPages, ctx: Pick<ConnectorContext, 'now' | 'catalog' | 'reviewedMatches'>): ConnectorBatch {
  const report = emptyReport();
  const today = zurichToday(ctx.now);
  const products = new Map<string, RetailerProduct>();
  const prices = new Map<string, PriceObservation>();
  const promotions = new Map<string, Promotion>();
  const seenSkus = new Set<string>();
  let itemsSeen = 0;
  let duplicates = 0;
  let nonGrocery = 0;
  let packUnreadable = 0;
  let unitPriceMismatch = 0;
  let futureActions = 0;
  let totalCount: number | null = null;

  for (const page of input.pages) {
    totalCount = page.json.meta?.pagination?.totalCount ?? totalCount;
    const source = { connectorId: ALDI_CONNECTOR_ID, kind: 'retailer_site' as const, ref: page.url };
    const observedAt = page.fetchedAt.toISOString();
    for (const item of page.json.data ?? []) {
      itemsSeen++;
      if (seenSkus.has(item.sku)) {
        duplicates++;
        continue;
      }
      seenSkus.add(item.sku);
      if (item.discontinued) continue;
      if (!isGroceryItem(item)) {
        nonGrocery++;
        continue;
      }
      const f = itemFacts(item);
      if (!f) {
        report.warnings.push({ message: `Article sans prix lisible : ${item.name} (${item.sku})` });
        continue;
      }
      const pack = parsePackText(f.packText);
      if (!pack) {
        packUnreadable++;
        report.warnings.push({ message: `Contenance illisible « ${f.packText} » : ${f.name} (${f.sku})` });
        continue;
      }
      // Contrôle du prix de base publié (hors variantes) : > 35 % → rejet, > 5 % → avertissement.
      const dev = f.comparisonBasis && !pack.ambiguous ? unitPriceDeviation(f.comparisonBasis, f.priceCents, pack.quantity) : null;
      if (dev !== null && dev > 0.35) {
        unitPriceMismatch++;
        report.rejected.push({ message: `Prix de base incohérent (${(dev * 100).toFixed(0)} %) : ${f.name} ${f.packText}` });
        continue;
      }
      if (dev !== null && dev > 0.05) {
        report.warnings.push({ message: `Prix de base divergent (${(dev * 100).toFixed(0)} %), prix conservé : ${f.name} ${f.packText}` });
      }

      const skuShort = f.sku.replace(/^0+/, '') || f.sku;
      const id = `aldi:${skuShort}`;
      const url = f.slug ? aldiProductUrl(f.slug, f.sku) : null;
      products.set(id, {
        id,
        chainId: 'aldi',
        connectorId: ALDI_CONNECTOR_ID,
        sku: f.sku,
        gtin: null,
        name: f.name,
        brand: f.brand,
        quantity: pack.quantity,
        attributes: { organic: f.organic, swissOrigin: f.swiss, labels: labelsFromName(f.name, pack.ambiguous) },
        url,
        isDemo: false,
      });

      const base = {
        retailerProductId: id,
        zoneId: null,
        storeId: null,
        source,
        isDemo: false,
      };

      if (f.wasPriceCents) {
        // Réduction annoncée : prix d'action + dernier prix normal communiqué par Aldi (« au lieu de »).
        const validFrom = f.onSaleDate ?? today;
        const pid = `${ALDI_CONNECTOR_ID}:${skuShort}:${validFrom}:reduc`;
        promotions.set(pid, {
          ...base,
          id: pid,
          chainId: 'aldi',
          type: 'price',
          promoPriceCents: f.priceCents,
          referencePriceCents: f.wasPriceCents,
          whileStocksLast: true,
          endIsPresumed: true,
          label: f.savingsText ?? 'Action',
          publishedAt: observedAt,
          validFrom,
          validTo: maxDate(addDays(validFrom, 6), today),
          sourceUrl: url,
          verifiedAt: observedAt,
        });
        const oid = `${ALDI_CONNECTOR_ID}:${skuShort}:ref:${today}`;
        prices.set(oid, {
          ...base,
          id: oid,
          priceCents: f.wasPriceCents,
          observedAt,
          priceType: 'regular',
          channel: 'store',
          reliability: 'official',
          license: null,
          sourceUrl: url,
          proof: 'public_api',
        });
      } else if (f.isAction) {
        // Article d'action (assortiment temporaire), éventuellement annoncé à l'avance :
        // valable dès la date de mise en vente, jusqu'à épuisement du stock (fin présumée).
        const validFrom = f.onSaleDate ?? today;
        if (validFrom > today) futureActions++;
        const pid = `${ALDI_CONNECTOR_ID}:${skuShort}:${validFrom}:action`;
        promotions.set(pid, {
          ...base,
          id: pid,
          chainId: 'aldi',
          type: 'price',
          promoPriceCents: f.priceCents,
          referencePriceCents: null,
          whileStocksLast: true,
          endIsPresumed: true,
          label: 'Action Aldi',
          publishedAt: observedAt,
          validFrom,
          validTo: maxDate(addDays(validFrom, 6), today),
          sourceUrl: url,
          verifiedAt: observedAt,
        });
      } else {
        const oid = `${ALDI_CONNECTOR_ID}:${skuShort}:${today}`;
        prices.set(oid, {
          ...base,
          id: oid,
          priceCents: f.priceCents,
          observedAt,
          priceType: 'regular',
          channel: 'store',
          reliability: 'official',
          license: null,
          sourceUrl: url,
          proof: 'public_api',
        });
      }
    }
  }

  const retailerProducts = [...products.values()];
  const { matches, reviewedCount } = matchesFor(retailerProducts, ctx.catalog ?? PRODUCTS, ctx.reviewedMatches);
  report.accepted = { products: retailerProducts.length, prices: prices.size, promotions: promotions.size, matches: matches.length };
  const uniqueSeen = seenSkus.size;
  if (totalCount !== null && uniqueSeen < totalCount * 0.98) {
    report.warnings.push({ message: `Pagination incomplète : ${uniqueSeen} articles distincts lus sur ${totalCount} annoncés` });
  }
  report.metrics = {
    pages: input.pages.length,
    totalCount: totalCount ?? 0,
    itemsSeen,
    uniqueItems: uniqueSeen,
    duplicates,
    nonGrocery,
    packUnreadable,
    unitPriceMismatch,
    futureActions,
    reviewedProducts: reviewedCount,
  };
  return {
    connectorId: ALDI_CONNECTOR_ID,
    retailerProducts,
    matches,
    prices: [...prices.values()],
    promotions: [...promotions.values()],
    report,
  };
}

function maxDate(a: string, b: string): string {
  return a > b ? a : b;
}

/* ------------------------------------------------------------------ */
/* Connecteur                                                          */
/* ------------------------------------------------------------------ */

export class AldiApiConnector implements PriceConnector {
  readonly id = ALDI_CONNECTOR_ID;
  readonly label = 'Aldi Suisse — API publique du site officiel (assortiment et actions)';
  readonly chainIds = ['aldi'];
  readonly sourceKind = 'retailer_site' as const;

  async status(ctx: Pick<ConnectorContext, 'env'>): Promise<ConnectorStatus> {
    if (ctx.env?.ALDI_API === 'off') return { state: 'disabled', message: 'Désactivé (ALDI_API=off)' };
    return { state: 'ready', message: 'API publique consommée par le site officiel, liste paginée uniquement' };
  }

  async run(ctx: ConnectorContext): Promise<ConnectorBatch> {
    const fetcher = requireFetcher(ctx);
    const maxPages = Number(ctx.env?.ALDI_MAX_PAGES ?? '0') || Number.POSITIVE_INFINITY;
    const input: AldiPages = { pages: [] };
    const failures: string[] = [];
    let total = Number.POSITIVE_INFINITY;
    for (let offset = 0, n = 0; offset < Math.min(total, ALDI_MAX_OFFSET) && n < maxPages; offset += ALDI_PAGE_SIZE, n++) {
      if (ctx.signal?.aborted) break;
      const url = aldiSearchUrl(offset);
      try {
        const r = await fetcher.get(url, 'application/json');
        const json = JSON.parse(r.body) as AldiApiPage;
        total = json.meta?.pagination?.totalCount ?? total;
        input.pages.push({ url, json, fetchedAt: r.fetchedAt });
        if (!json.data?.length) break;
      } catch (e) {
        if (e instanceof HttpBlockedError) throw e;
        failures.push(`${url} : ${e instanceof Error ? e.message : String(e)}`);
        if (offset === 0) throw e;
      }
    }
    const batch = buildAldiBatch(input, ctx);
    for (const f of failures) batch.report.warnings.push({ message: f });
    batch.report.metrics = { ...batch.report.metrics, pageFailures: failures.length };
    ctx.log.info('Aldi : collecte terminée', batch.report.metrics);
    return batch;
  }
}
