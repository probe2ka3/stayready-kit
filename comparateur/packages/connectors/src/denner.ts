import {
  VARIABLE_WEIGHT_LABEL,
  zurichToday,
  type PriceObservation,
  type Promotion,
  type Quantity,
  type RetailerProduct,
} from '@cabas/core';
import { ESSENTIAL_QUERIES, P1_ESSENTIALS, PRODUCTS } from '@cabas/reference';
import { HttpBlockedError, requireFetcher } from './http/fetcher';
import { labelsFromName, SWISS_NAME } from './lidl';
import { matchesFor } from './matching';
import { parsePackText } from './pack';
import { emptyReport, type ConnectorBatch, type ConnectorContext, type ConnectorStatus, type PriceConnector } from './types';

/**
 * Denner — site officiel `www.denner.ch` (docs/COLLECTE_QUOTIDIENNE.md, docs/DATA_SURFACES.md § 7).
 *
 * Pages rendues côté serveur (Nuxt) : l'état de la page (`__NUXT_DATA__`) contient les articles du
 * moteur de recherche du site (désignation, détail « UHT, 3,5 %, 6 x 1 litre », prix, « au lieu
 * de », dates d'action). Collecte **ciblée** : une recherche par besoin du noyau (`/fr/search?q=…`,
 * 5 résultats les plus pertinents, prix permanents et actions en cours) et les pages d'actions de la
 * semaine et de la suivante. `robots.txt` : tout autorisé hors panier et liste de courses.
 *
 * Droits : publication et usage commercial interdits sans accord écrit (« Précisions d'ordre
 * juridique ») : **collecte privée**, instantané dans `data/private/`, jamais publié. Les prix du site
 * sont indicatifs (« seuls sont valides les prix affichés dans les points de vente »).
 */

export const DENNER_ORIGIN = 'https://www.denner.ch';
export const DENNER_CONNECTOR_ID = 'denner-web';

/** Termes de recherche Denner (français) : ceux du noyau, précisés quand le site l'exige. */
const QUERY_OVERRIDES: Partial<Record<(typeof P1_ESSENTIALS)[number], string>> = {
  'pommes-gala-1kg': 'pommes',
  'oranges-2kg': 'oranges',
  'tomates-grappe-500g': 'tomates',
  'poivrons-500g': 'poivrons',
  'salade-iceberg-1': 'iceberg',
  'pdt-fermes-2500g': 'pommes de terre fermes',
  'pdt-farineuses-2500g': 'pommes de terre farineuses',
  'lait-demi-uht-1l': 'lait drink',
  'oeufs-sol-6': 'oeufs sol',
  'oeufs-plein-air-6': 'oeufs plein air',
  'thon-huile-240g': 'thon',
  'boeuf-hache-500g': 'viande hachée boeuf',
  'poulet-poitrine-500g': 'poulet',
  'jambon-cuit-150g': 'jambon',
  'sel-cuisine-1kg': 'sel',
  'huile-olive-1l': "huile d'olive",
};

export function dennerQuery(slug: (typeof P1_ESSENTIALS)[number]): string {
  return QUERY_OVERRIDES[slug] ?? ESSENTIAL_QUERIES[slug].fr;
}

export function dennerSearchUrl(query: string): string {
  return `${DENNER_ORIGIN}/fr/search?q=${encodeURIComponent(query)}`;
}

/** Actions de la semaine et actions annoncées (« dès jeudi »), paginées. */
export const DENNER_ACTION_PAGES = ['/fr/actions/actions-actuelles', '/fr/actions/actions-dès-jeudi'];

/* ------------------------------------------------------------------ */
/* État Nuxt (format « devalue » : tableau de valeurs référencées)     */
/* ------------------------------------------------------------------ */

const SPECIAL: Record<number, unknown> = { [-1]: undefined, [-2]: undefined, [-3]: Number.NaN, [-4]: Infinity, [-5]: -Infinity, [-6]: -0 };
const WRAPPERS = new Set(['ShallowReactive', 'Reactive', 'Ref', 'ShallowRef', 'EmptyRef', 'EmptyShallowRef', 'NuxtError']);

/** Décode `<script id="__NUXT_DATA__">` ; null si la page n'en contient pas (structure modifiée). */
export function decodeNuxtData(html: string): unknown {
  const m = /<script[^>]*id="__NUXT_DATA__"[^>]*>([\s\S]*?)<\/script>/.exec(html);
  if (!m) return null;
  let arr: unknown[];
  try {
    arr = JSON.parse(m[1] as string) as unknown[];
  } catch {
    return null;
  }
  const memo = new Map<number, unknown>();
  const rev = (i: number): unknown => {
    if (i < 0) return SPECIAL[i];
    if (memo.has(i)) return memo.get(i);
    const v = arr[i];
    if (Array.isArray(v)) {
      const head = v[0];
      if (typeof head === 'string' && WRAPPERS.has(head)) {
        const r = v.length > 1 ? rev(v[1] as number) : undefined;
        memo.set(i, r);
        return r;
      }
      if (head === 'Date') return v[1];
      if (head === 'Set') return (v.slice(1) as number[]).map(rev);
      if (head === 'Map' || head === 'null' || head === 'Object') return {};
      const out: unknown[] = [];
      memo.set(i, out);
      for (const x of v) out.push(typeof x === 'number' ? rev(x) : x);
      return out;
    }
    if (v && typeof v === 'object') {
      const out: Record<string, unknown> = {};
      memo.set(i, out);
      for (const [k, x] of Object.entries(v as Record<string, unknown>)) out[k] = typeof x === 'number' ? rev(x) : x;
      return out;
    }
    return v;
  };
  return rev(0);
}

export type DennerAttrs = Record<string, string | string[] | undefined>;

export interface DennerGrid {
  items: Array<{ sku: string; price: string | number | null; attrs: DennerAttrs }>;
  totalPages: number;
  totalResults: number;
}

/** Articles de tous les blocs de recherche de la page (grille, résultats de recherche). */
export function extractDennerGrid(nuxt: unknown): DennerGrid | null {
  const data = (nuxt as { data?: Record<string, unknown> } | null)?.data;
  if (!data || typeof data !== 'object') return null;
  const items: DennerGrid['items'] = [];
  let totalPages = 0;
  let totalResults = 0;
  let blocks = 0;
  for (const value of Object.values(data)) {
    const searches = (value as { blocks?: { searches?: unknown[] } } | null)?.blocks?.searches;
    if (!Array.isArray(searches)) continue;
    for (const b of searches as Array<{ stats?: { totalPages?: number; totalResults?: number }; slots?: Array<{ item?: { sku?: string; price?: string | number; attributeInfo?: Array<{ attributeName: string; vals?: Array<{ value?: string }> }> } }> }>) {
      blocks++;
      totalPages = Math.max(totalPages, Number(b.stats?.totalPages ?? 0));
      totalResults = Math.max(totalResults, Number(b.stats?.totalResults ?? 0));
      for (const slot of b.slots ?? []) {
        const it = slot.item;
        if (!it?.sku) continue;
        const attrs: DennerAttrs = {};
        for (const a of it.attributeInfo ?? []) {
          const vals = (a.vals ?? []).map((v) => v.value).filter((v): v is string => typeof v === 'string');
          attrs[a.attributeName] = vals.length > 1 ? vals : vals[0];
        }
        items.push({ sku: it.sku, price: it.price ?? null, attrs });
      }
    }
  }
  return blocks ? { items, totalPages, totalResults } : null;
}

/* ------------------------------------------------------------------ */
/* Article                                                             */
/* ------------------------------------------------------------------ */

const one = (v: string | string[] | undefined): string | undefined => (Array.isArray(v) ? v[0] : v);

/** « 0.5 unit.ml » (litres), « 1 unit.kg », « 0.6 unit.g » (kilogrammes), « 75 cl », « 20 pièce ». */
export function contentSizeQuantity(text: string | undefined): Quantity | null {
  if (!text) return null;
  const m = /^(\d+(?:[.,]\d+)?)\s*unit\.(kg|g|ml|l)$/.exec(text.trim());
  if (m) {
    const n = Number((m[1] as string).replace(',', '.'));
    if (!(n > 0)) return null;
    // Unité de base Denner : kilogramme ou litre (« 0.5 unit.ml » = 0,5 l ; « 0.6 unit.g » = 0,6 kg).
    return m[2] === 'ml' || m[2] === 'l' ? { amount: Math.round(n * 1000), unit: 'ml' } : { amount: Math.round(n * 1000), unit: 'g' };
  }
  return parsePackText(text)?.quantity ?? null;
}

/** Dates d'action publiées : « 24.09–30.09.2026 », « Jusqu'au 30.09.2026 », « Dès le 01.10.2026 », « 01.10–04.10.2026 ». */
export function parseDennerPeriod(label: string | undefined): { from: string | null; to: string | null } {
  if (!label) return { from: null, to: null };
  const t = label.replace(/\s+/g, ' ');
  const iso = (d: string, mth: string, y: string) => `${y}-${mth.padStart(2, '0')}-${d.padStart(2, '0')}`;
  const range = /(\d{1,2})\.(\d{1,2})\.?(\d{4})?\s*[–-]\s*(\d{1,2})\.(\d{1,2})\.(\d{4})/.exec(t);
  if (range) {
    const y2 = range[6] as string;
    return { from: iso(range[1] as string, range[2] as string, range[3] ?? y2), to: iso(range[4] as string, range[5] as string, y2) };
  }
  const until = /jusqu.au\s+(\d{1,2})\.(\d{1,2})\.(\d{4})/i.exec(t);
  if (until) return { from: null, to: iso(until[1] as string, until[2] as string, until[3] as string) };
  const since = /d[èe]s (?:le |jeudi,? )?(\d{1,2})\.(\d{1,2})\.(\d{4})/i.exec(t);
  if (since) return { from: iso(since[1] as string, since[2] as string, since[3] as string), to: null };
  return { from: null, to: null };
}

function cents(v: string | number | null | undefined): number | null {
  const n = typeof v === 'number' ? v : Number(String(v ?? '').replace(/[^\d.]/g, ''));
  return Number.isFinite(n) && n > 0 && n < 10_000 ? Math.round(n * 100) : null;
}

export interface DennerParsed {
  product: RetailerProduct;
  /** Prix permanent (article sans action). */
  regularCents: number | null;
  promotion: { promoCents: number; referenceCents: number | null; from: string | null; to: string | null; label: string } | null;
}

export type DennerSkip = { skip: string };

/**
 * Lit un article de la grille. Rien n'est deviné : sans contenance lisible, sans prix ou avec une
 * offre conditionnelle (« sur toutes les bières », « dès 2 pièces »), l'article est écarté.
 */
export function parseDennerItem(item: DennerGrid['items'][number]): DennerParsed | DennerSkip {
  const a = item.attrs;
  const articleId = one(a.articleId) ?? one(a.pimcoreId);
  const name = (one(a.name) ?? '').trim();
  if (!articleId || !name) return { skip: 'article sans identifiant' };
  const priceCents = cents(item.price ?? one(a.price) ?? one(a.standardPrice));
  if (!priceCents) return { skip: 'prix nul ou offre générale' };
  const subline = (one(a.nameSubline) ?? '').trim();
  const discountText = one(a.discount_text) ?? '';
  if (/dès\s+\d+|à partir de \d+|\d+\s*pour\s*\d+|2e|deuxième/i.test(`${discountText} ${name}`)) return { skip: 'offre conditionnelle' };

  // Conditionnement : détail publié (« …, 6 x 1 litre », « …, 1,5 litre », « Suisse, le kg »), lu depuis la fin.
  const segments = subline.split(/,\s+/).map((s) => s.trim()).filter(Boolean).reverse();
  let fromSubline: ReturnType<typeof parsePackText> = null;
  let packSegment = '';
  for (const seg of segments) {
    fromSubline = parsePackText(seg);
    if (fromSubline) {
      packSegment = seg;
      break;
    }
  }
  // Œufs : « 6 x 53+ g », « 12 x 53 g », « …, importés, 12 » = nombre d'œufs (le poids est un calibre).
  // (« \b » ne reconnaît pas « Œ » : recherche simple de « œuf » / « oeuf ».)
  if (/œuf|oeuf/i.test(name) && !/p[âa]ques|liqueur|chocolat|sucre|fourr/i.test(name)) {
    const eggs = /(\d+)\s*[x×]\s*\d+\s*\+?\s*g/i.exec(subline)?.[1] ?? /(?:^|,\s*)(\d+)\s*(?:pi[èe]ces?)?\s*$/.exec(subline)?.[1];
    fromSubline = eggs ? { quantity: { amount: Number(eggs), unit: 'piece' }, variableWeight: false, ambiguous: false } : null;
    packSegment = eggs ? `${eggs} x 1` : packSegment;
  }
  const salesQty = Math.max(1, Number(one(a.salesQuantity) ?? 1) || 1);
  const multi = /\d\s*[x×]\s*\d/.test(packSegment);
  // Vendu par lot sans « N x » dans le détail : contenance du lot incertaine, jamais devinée.
  if (salesQty > 1 && !multi) return { skip: 'lot ambigu' };
  const quantity: Quantity | null = fromSubline?.quantity ?? (salesQty === 1 ? contentSizeQuantity(one(a.content_size_text)) : null);
  if (!quantity) return { skip: 'contenance inconnue' };
  const perKg = fromSubline?.variableWeight ?? false;
  const text = `${name} ${subline}`;
  const ecoLabels = [a.eco_labels].flat().filter(Boolean).join(' ');
  const organic = /\bbio\b|enerbio/i.test(text) || /bio/i.test(ecoLabels);
  // Appellations d'origine protégées suisses (Gruyère, Emmentaler…) : origine suisse par définition légale.
  const swissAop = /\b(le )?gruy[èe]re aop|emmentaler aop|sbrinz aop|t[êe]te de moine aop|vacherin fribourgeois aop|raclette du valais aop/i.test(name);
  const swissOrigin = /IP-SUISSE|Suisse Garantie/i.test(`${text} ${ecoLabels}`) || SWISS_NAME.test(name) || /^suisse\b/i.test(subline) || swissAop;
  const labels = [...labelsFromName(text), ...(perKg ? [VARIABLE_WEIGHT_LABEL] : [])];
  const path = (one(a.itemUrl) ?? '').split('?')[0] || `/fr/p${articleId}`;
  const product: RetailerProduct = {
    id: `denner:${articleId}`,
    chainId: 'denner',
    connectorId: DENNER_CONNECTOR_ID,
    sku: articleId,
    gtin: null,
    name: subline ? `${name} (${subline})` : name,
    brand: /\bdenner\b/i.test(name) ? 'Denner' : null,
    quantity,
    attributes: { organic, swissOrigin, labels },
    url: `${DENNER_ORIGIN}${path}`,
    isDemo: false,
  };

  const label = one(a.promotionLabel) ?? one(a.promotionLabelPublication) ?? '';
  const insteadCents = cents(/(\d+[.,]\d{2})/.exec(one(a.insteadPriceText) ?? '')?.[1]?.replace(',', '.'));
  const period = parseDennerPeriod(label);
  const epochDay = (v: string | undefined, endExclusive: boolean) => {
    const n = Number(v);
    if (!Number.isFinite(n) || n <= 0) return null;
    return zurichToday(new Date(n * 1000 - (endExclusive ? 1000 : 0)));
  };
  const hasDiscount = one(a.has_discount) === 'true' || Boolean(insteadCents) || one(a.promo_current_week) === 'true' || one(a.promo_next_week) === 'true';
  const to = period.to ?? epochDay(one(a.promotionTo), true);
  if (hasDiscount || (to && label && !/^depuis/i.test(label))) {
    if (insteadCents && insteadCents <= priceCents) return { skip: 'prix « au lieu de » incohérent' };
    return {
      product,
      regularCents: null,
      promotion: { promoCents: priceCents, referenceCents: insteadCents, from: period.from ?? epochDay(one(a.promotionFrom), false), to, label: label || (one(a.insteadPriceText) ?? 'Action') },
    };
  }
  // « Depuis le 11.06.2026 » sans prix de référence : nouveau prix permanent.
  return { product, regularCents: priceCents, promotion: null };
}

export interface DennerPages {
  pages: Array<{ url: string; html: string; fetchedAt: Date; query?: string }>;
}

/** Lot à partir des pages lues (recherches et actions), sans nouvelle requête. */
export function buildDennerBatch(input: DennerPages, ctx: Pick<ConnectorContext, 'now' | 'catalog' | 'reviewedMatches'>): ConnectorBatch {
  const report = emptyReport();
  const products = new Map<string, RetailerProduct>();
  const prices = new Map<string, PriceObservation>();
  const promotions = new Map<string, Promotion>();
  const skipped: Record<string, number> = {};
  let structureErrors = 0;
  let queriesWithItems = 0;
  const today = zurichToday(ctx.now);
  for (const page of input.pages) {
    const grid = extractDennerGrid(decodeNuxtData(page.html));
    if (!grid) {
      structureErrors++;
      report.warnings.push({ message: `Structure inattendue (état Nuxt absent) : ${page.url}` });
      continue;
    }
    if (page.query && grid.items.length) queriesWithItems++;
    const day = zurichToday(page.fetchedAt);
    for (const item of grid.items) {
      const r = parseDennerItem(item);
      if ('skip' in r) {
        skipped[r.skip] = (skipped[r.skip] ?? 0) + 1;
        continue;
      }
      const p = r.product;
      if (!products.has(p.id)) products.set(p.id, p);
      const observedAt = page.fetchedAt.toISOString();
      if (r.regularCents) {
        prices.set(p.id, {
          id: `${DENNER_CONNECTOR_ID}:${p.sku}:${day}`,
          retailerProductId: p.id,
          zoneId: null,
          storeId: null,
          priceCents: r.regularCents,
          observedAt,
          source: { connectorId: DENNER_CONNECTOR_ID, kind: 'retailer_site', ref: page.url },
          isDemo: false,
          priceType: 'regular',
          channel: 'store',
          reliability: 'official',
          sourceUrl: p.url,
          proof: 'web_page',
        });
      }
      if (r.promotion) {
        const pr = r.promotion;
        // Début inconnu : l'action est au moins valable le jour de la lecture ; fin inconnue : présumée à ce jour.
        const validFrom = pr.from ?? day;
        const validTo = pr.to ?? day;
        if (validTo < today) {
          skipped['action expirée'] = (skipped['action expirée'] ?? 0) + 1;
          continue;
        }
        promotions.set(`${p.id}:${validFrom}`, {
          id: `${DENNER_CONNECTOR_ID}:${p.sku}:${validFrom}`,
          retailerProductId: p.id,
          chainId: 'denner',
          zoneId: null,
          storeId: null,
          type: 'price',
          promoPriceCents: pr.promoCents,
          referencePriceCents: pr.referenceCents,
          loyaltyProgram: null,
          whileStocksLast: false,
          endIsPresumed: !pr.to,
          label: pr.label,
          sourceUrl: p.url,
          publishedAt: observedAt,
          validFrom,
          validTo: validTo < validFrom ? validFrom : validTo,
          source: { connectorId: DENNER_CONNECTOR_ID, kind: 'retailer_site', ref: page.url },
          verifiedAt: observedAt,
          isDemo: false,
        });
      }
    }
  }
  const retailerProducts = [...products.values()];
  const { matches, reviewedCount } = matchesFor(retailerProducts, ctx.catalog ?? PRODUCTS, ctx.reviewedMatches);
  report.accepted = { products: retailerProducts.length, prices: prices.size, promotions: promotions.size, matches: matches.length };
  report.metrics = {
    pages: input.pages.length,
    queries: input.pages.filter((p) => p.query).length,
    queriesWithItems,
    structureErrors,
    reviewedProducts: reviewedCount,
    ...Object.fromEntries(Object.entries(skipped).map(([k, v]) => [`skipped: ${k}`, v])),
  };
  return { connectorId: DENNER_CONNECTOR_ID, retailerProducts, matches, prices: [...prices.values()], promotions: [...promotions.values()], report };
}

export class DennerWebConnector implements PriceConnector {
  readonly id = DENNER_CONNECTOR_ID;
  readonly label = 'Denner — site officiel (recherche ciblée et actions), usage privé';
  readonly chainIds = ['denner'];
  readonly sourceKind = 'retailer_site' as const;

  async status(ctx: Pick<ConnectorContext, 'env'>): Promise<ConnectorStatus> {
    if (ctx.env?.DENNER_WEB === 'off') return { state: 'disabled', message: 'Désactivé (DENNER_WEB=off)' };
    return { state: 'ready', message: 'Pages publiques officielles, collecte privée (publication interdite sans accord)' };
  }

  async run(ctx: ConnectorContext): Promise<ConnectorBatch> {
    const fetcher = requireFetcher(ctx);
    const needs = (ctx.targets?.needs ?? [...P1_ESSENTIALS]).filter((s): s is (typeof P1_ESSENTIALS)[number] => (P1_ESSENTIALS as readonly string[]).includes(s));
    const maxActionPages = Number(ctx.env?.DENNER_MAX_ACTION_PAGES ?? '12');
    const input: DennerPages = { pages: [] };
    const failures: string[] = [];
    const read = async (url: string, query?: string) => {
      try {
        const r = await fetcher.get(url);
        input.pages.push({ url, html: r.body, fetchedAt: r.fetchedAt, query });
        return r.body;
      } catch (e) {
        if (e instanceof HttpBlockedError) throw e;
        failures.push(`${url} : ${e instanceof Error ? e.message : String(e)}`);
        return null;
      }
    };
    for (const slug of needs) {
      if (ctx.signal?.aborted) break;
      await read(dennerSearchUrl(dennerQuery(slug)), slug);
    }
    for (const path of DENNER_ACTION_PAGES) {
      const first = await read(`${DENNER_ORIGIN}${encodeURI(path)}`);
      const pages = first ? Math.min(extractDennerGrid(decodeNuxtData(first))?.totalPages ?? 1, Math.max(1, Math.floor(maxActionPages / DENNER_ACTION_PAGES.length))) : 0;
      for (let n = 2; n <= pages; n++) {
        if (ctx.signal?.aborted) break;
        await read(`${DENNER_ORIGIN}${encodeURI(path)}?page=${n}`);
      }
    }
    if (input.pages.length === 0) throw new Error(`Aucune page Denner lue (${failures.length} échecs)`);
    const batch = buildDennerBatch(input, ctx);
    for (const f of failures) batch.report.warnings.push({ message: f });
    batch.report.metrics = { ...batch.report.metrics, pageFailures: failures.length };
    // Structure modifiée sur la majorité des pages : échec explicite, l'instantané précédent est conservé.
    if (Number(batch.report.metrics.structureErrors) > input.pages.length / 2) {
      throw new Error(`Structure des pages Denner modifiée (${batch.report.metrics.structureErrors}/${input.pages.length} pages sans état Nuxt)`);
    }
    ctx.log.info('Denner : collecte terminée', batch.report.metrics);
    return batch;
  }
}
