import {
  addDays,
  zurichToday,
  type PriceObservation,
  type Promotion,
  type RetailerProduct,
} from '@cabas/core';
import { PRODUCTS } from '@cabas/reference';
import { decodeEntities, textOf } from './html';
import { HttpBlockedError, requireFetcher } from './http/fetcher';
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
 * Connecteur Lidl Suisse — pages publiques officielles (voir docs/audit/03-sources-prix.md §4.1).
 *
 * 1. Assortiment permanent : pages catégories de `sortiment.lidl.ch` (première page de chaque
 *    catégorie : la pagination par paramètre est exclue par robots.txt).
 * 2. Actions datées : pages d'actions alimentaires de `www.lidl.ch` (données structurées
 *    `data-grid-data`), y compris les actions annoncées à l'avance, régionales ou Lidl Plus.
 *
 * Seuls des faits sont conservés (désignation, format, prix, dates, numéro d'article, URL).
 */

export const LIDL_ASSORTMENT_ORIGIN = 'https://sortiment.lidl.ch';
export const LIDL_WWW_ORIGIN = 'https://www.lidl.ch';
export const LIDL_CONNECTOR_ID = 'lidl-web';

/** Catégories hors périmètre (médicaments, tabac, distributeurs, pages techniques). */
const EXCLUDED_CATEGORY = /(tabakwaren|arzneimittel|heissgetrankeautomat|privacy|alle-kategorien|catalog\/|\/fr\/?$)/;
/**
 * Catégories utiles au noyau de 50 aliments (collecte ciblée) : fruits, légumes, pommes de terre,
 * farine, sucre, sel, huiles, pâtes, riz, produits laitiers, œufs, pain, viande, conserves,
 * confiture, café, plus les listes « moins cher durablement » et « actions ».
 */
export const LIDL_CORE_CATEGORY =
  /\/fr\/(obst-gemuese\/(obst|gemuese|huelsenfruechte)|pasta-reis\/(pasta|reis)|brot-backwaren\/(brot|zucker-salz-mehl)|gewu(e)?rze-o(e)?le\/(ole|zucker-salz-mehl|saucen)|milchprodukte-eier\/(joghurt-quark|milch|butter|kaese|eier)|fleisch\/(gefluegel|rind|wurst-aufschnitt)|konserven\/(obstkonserven-gemuesekonserven|fleisch-und-fischkonserven)|muesli-brotaufstrich\/(brotaufstriche-honig|mueesli)|kaffee-tee\/kaffee|auf-dauer-guenstiger|aktuelle-aktionen)\/?$/;

/** Forme canonique d'une fiche (`…/view/id/N/`), quelle que soit l'adresse enregistrée. */
export function lidlProductPageUrl(url: string): string | null {
  const id = /\/catalog\/product\/view\/id\/(\d+)/.exec(url)?.[1];
  return id ? `${LIDL_ASSORTMENT_ORIGIN}/fr/catalog/product/view/id/${id}` : null;
}

/** Pages d'actions non alimentaires connues (le filtre « Food » s'applique de toute façon). */
const NON_FOOD_OFFERS = /(parkside|mode-|vestes|dormir|maison|plantes|cuisine\/|bebe|bricolage|cartes-prepayees|coupons|offres-lidl-plus)/;

/* ------------------------------------------------------------------ */
/* Découverte                                                          */
/* ------------------------------------------------------------------ */

/** Pages catégories (FR) du plan du site de l'assortiment. */
export function discoverAssortmentCategories(sitemapXml: string): string[] {
  const urls = [...sitemapXml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => decodeEntities(m[1] as string).trim());
  return urls.filter((u) => {
    if (!u.startsWith(`${LIDL_ASSORTMENT_ORIGIN}/fr/`)) return false;
    const path = new URL(u).pathname;
    const depth = path.split('/').filter(Boolean).length;
    return depth >= 2 && depth <= 3 && !EXCLUDED_CATEGORY.test(path);
  });
}

/**
 * Fiches produits (FR) du plan du site : `/fr/catalog/product/view/id/N`. Publiées par Lidl dans
 * son sitemap et non visées par `Disallow: /catalog/` (qui ne concerne que la racine).
 */
export function discoverProductPages(sitemapXml: string): string[] {
  const urls = [...sitemapXml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => decodeEntities(m[1] as string).trim());
  return urls
    .filter((u) => /^https:\/\/sortiment\.lidl\.ch\/fr\/catalog\/product\/view\/id\/\d+\/?$/.test(u))
    .sort((a, b) => productIdOf(a) - productIdOf(b));
}

function productIdOf(url: string): number {
  return Number(/\/id\/(\d+)/.exec(url)?.[1] ?? 0);
}

/**
 * Tranche du jour d'une rotation sur l'ensemble des fiches : chaque fiche est relue tous les
 * `ceil(n / perRun)` jours, sans état à conserver entre deux collectes.
 */
export function rotationSlice<T>(items: T[], perRun: number, now: Date): { slice: T[]; chunk: number; chunks: number } {
  if (items.length === 0 || perRun <= 0) return { slice: [], chunk: 0, chunks: 0 };
  const chunks = Math.ceil(items.length / perRun);
  const day = Math.floor(Date.parse(`${zurichToday(now)}T00:00:00Z`) / 86_400_000);
  const chunk = day % chunks;
  return { slice: items.slice(chunk * perRun, (chunk + 1) * perRun), chunk, chunks };
}

/** Articles hors périmètre repérables à la désignation (tabac : absent des catégories collectées). */
const EXCLUDED_PRODUCT = /(cigarett|zigarett|cigare|tabac|tabak|snus|brunette|marlboro|parisienne|chesterfield|winston|camel\b|burrus|mary long|lucky strike|pall mall|l&m\b|gauloises|davidoff)/i;

/** Fiche produit de l'assortiment : même composant de prix que les pages catégories. */
export function parseProductPage(html: string, pageUrl: string): LidlAssortmentItem | null {
  const og = /<meta property="og:url"\s+content="([^"]+)"/.exec(html)?.[1];
  const slug = og ? /\/s\/([a-z0-9-]+)\/?$/.exec(og)?.[1] : undefined;
  const article = slug ? /-(\d{4,})$/.exec(slug)?.[1] : undefined;
  const title = /<h1 class="page-title">([\s\S]*?)<\/h1>/.exec(html)?.[1];
  const start = html.indexOf('class="price-box');
  if (!article || !title || start < 0) return null;
  const end = html.indexOf('towishlist-wrapper', start);
  const box = html.slice(start, end > start ? end : start + 6000);
  const price = /itemprop="price" content="(\d+(?:\.\d+)?)"/.exec(box);
  if (!price) return null;
  const name = textOf(title);
  if (EXCLUDED_PRODUCT.test(name)) return null;
  const footer = /<span class="pricefield__footer">([\s\S]*?)<\/span>/.exec(box);
  let lidlPlusPriceCents: number | null = null;
  const lp = box.indexOf('pricefield__badge--lidl-plus');
  if (lp >= 0) {
    const strong = /<strong class="pricefield__price"[^>]*>([\s\S]*?)<\/strong>/.exec(box.slice(lp));
    lidlPlusPriceCents = strong ? displayedCents(strong[1] as string) : null;
  }
  // Pastilles (origine suisse…) : liste placée après le bloc de prix.
  const badges = /<ul class="product-badges-list">([\s\S]*?)<\/ul>/.exec(html)?.[1] ?? '';
  return {
    articleNo: article,
    name,
    priceCents: Math.round(Number(price[1]) * 100),
    lidlPlusPriceCents,
    packText: footer ? textOf(footer[1] as string) : '',
    isAction: /pricefield--discount/.test(box) || /pricefield__header">\s*Aktion/.test(box),
    swiss: /badges\/(Schweizer_Kreuz|suisse_garantie)/i.test(badges) || SWISS_NAME.test(name),
    url: og ?? pageUrl,
  };
}

/** Pages d'actions liées depuis la page d'accueil (`/c/fr-CH/<thème>/a<id>`). */
export function discoverOfferPages(homeHtml: string): string[] {
  const set = new Set<string>();
  for (const m of homeHtml.matchAll(/href="(\/c\/fr-CH\/[a-z0-9-]+\/a\d+)"/g)) {
    const path = m[1] as string;
    if (!NON_FOOD_OFFERS.test(path)) set.add(`${LIDL_WWW_ORIGIN}${path}`);
  }
  return [...set].sort();
}

/* ------------------------------------------------------------------ */
/* Assortiment                                                          */
/* ------------------------------------------------------------------ */

export interface LidlAssortmentItem {
  articleNo: string;
  name: string;
  priceCents: number;
  /** Prix réservé aux membres Lidl Plus, affiché en plus du prix de vente. */
  lidlPlusPriceCents: number | null;
  packText: string;
  isAction: boolean;
  swiss: boolean;
  url: string;
}

/** Prix affiché (texte) d'un bloc `pricefield__price` : « 1.99 » reconstitué depuis le balisage. */
function displayedCents(fragment: string): number | null {
  const t = textOf(fragment).replace(/\*/g, '').replace(/CHF/g, '').replace(/\s+/g, '');
  const m = /^(\d+)\.?(\d{2})$/.exec(t);
  return m ? Number(m[1]) * 100 + Number(m[2]) : null;
}

export function parseAssortmentPage(html: string): { items: LidlAssortmentItem[]; pageCount: number | null } {
  const items: LidlAssortmentItem[] = [];
  const blocks = html.split(/<li class="item product product-item/).slice(1);
  for (const block of blocks) {
    const href = /href="(https:\/\/sortiment\.lidl\.ch\/fr\/catalog\/product\/view\/id\/\d+\/s\/([a-z0-9-]+)\/[^"]*)"/.exec(block);
    const name = /<strong class="product name product-item-name">([\s\S]*?)<\/strong>/.exec(block);
    const price = /itemprop="price" content="(\d+(?:\.\d+)?)"/.exec(block);
    const footer = /<span class="pricefield__footer">([\s\S]*?)<\/span>/.exec(block);
    if (!href || !name || !price) continue;
    const article = /-(\d{4,})$/.exec(href[2] as string);
    if (!article) continue;
    let lidlPlusPriceCents: number | null = null;
    const lp = block.indexOf('pricefield__badge--lidl-plus');
    if (lp >= 0) {
      const strong = /<strong class="pricefield__price"[^>]*>([\s\S]*?)<\/strong>/.exec(block.slice(lp));
      lidlPlusPriceCents = strong ? displayedCents(strong[1] as string) : null;
    }
    items.push({
      articleNo: article[1] as string,
      name: textOf(name[1] as string),
      priceCents: Math.round(Number(price[1]) * 100),
      lidlPlusPriceCents,
      packText: footer ? textOf(footer[1] as string) : '',
      isAction: /pricefield--discount/.test(block) || /pricefield__header">\s*Aktion/.test(block),
      swiss: /badges\/(Schweizer_Kreuz|suisse_garantie)/i.test(block) || SWISS_NAME.test(textOf(name[1] as string)),
      url: (href[1] as string).replace(/\/category\/\d+\/?$/, '/'),
    });
  }
  const pages = /id="am-page-count"[^>]*>(\d+)</.exec(html);
  return { items, pageCount: pages ? Number(pages[1]) : null };
}

/* ------------------------------------------------------------------ */
/* Actions                                                             */
/* ------------------------------------------------------------------ */

interface GridPrice {
  price?: number;
  oldPrice?: number;
  discount?: { discountText?: string; deletedPrice?: number };
}

interface GridItem {
  category?: string;
  fullTitle?: string;
  title?: string;
  erpNumber?: string;
  productId?: number;
  canonicalPath?: string;
  renderedTs?: number;
  storeStartDate?: number;
  storeEndDate?: number | null;
  price?: GridPrice;
  lidlPlus?: Array<{ price?: GridPrice }>;
  brand?: { name?: string; showBrand?: boolean };
  keyfacts?: { description?: string; title?: string };
  seals?: Array<{ altText?: string }>;
  stockAvailability?: { badgeInfoV2?: Array<{ validFrom?: number; validUntil?: number }> };
}

export type LidlRegion = 'lidl-ticino' | 'lidl-romandie' | 'lidl-deutschschweiz';

export interface LidlOffer {
  erpNumber: string;
  name: string;
  brand: string | null;
  packText: string;
  swiss: boolean;
  organic: boolean;
  /** Régions de validité ; null = toute la Suisse. */
  regions: LidlRegion[] | null;
  regionNote: string | null;
  priceCents: number | null;
  referencePriceCents: number | null;
  mechanic: string | null;
  lidlPlusPriceCents: number | null;
  lidlPlusReferenceCents: number | null;
  validFrom: string | null;
  validTo: string | null;
  renderedAt: string | null;
  url: string;
}

const QUALITY_BRANDS = /^(qualit[éè] suisse|bio|deluxe)$/i;
/** Labels lisibles dans la désignation (utilisés comme exigences du catalogue). */
export function labelsFromName(text: string, ambiguous = false): string[] {
  const labels: string[] = [];
  if (/sans lactose|laktosefrei|lactose[- ]free/i.test(text)) labels.push('lactose-free');
  if (/\bv[ée]g[ae]ne?\b|\bvegan\b/i.test(text)) labels.push('vegan');
  if (/\b(AOP|AOC|DOP|PDO)\b/.test(text)) labels.push('aop');
  if (ambiguous) labels.push('variantes');
  return labels;
}

/** Origine suisse revendiquée dans la désignation (« Oeufs suisses », « … de la Suisse romande »). */
export const SWISS_NAME = /\b(suisses?|schweizer|de suisse|svizzer[ao])\b/i;

function zurichDateOf(epochSec: number | null | undefined): string | null {
  if (!epochSec || !Number.isFinite(epochSec)) return null;
  return zurichToday(new Date(epochSec * 1000));
}

function cents(v: number | undefined | null): number | null {
  return typeof v === 'number' && v > 0 ? Math.round(v * 100) : null;
}

/** Régions mentionnées (« valable uniquement au Tessin », « … en Suisse romande »). */
export function parseRegions(text: string): { regions: LidlRegion[] | null; note: string | null; unknown: boolean } {
  const t = text.toLowerCase();
  // « uniquement en pack de 6 » n'est pas une restriction géographique.
  if (!/valable uniquement|uniquement valable|nur (im|in der) |solo (in|nel) /.test(t)) {
    return { regions: null, note: null, unknown: false };
  }
  const regions: LidlRegion[] = [];
  if (/tessin|ticino/.test(t)) regions.push('lidl-ticino');
  if (/suisse romande|romandie|westschweiz/.test(t)) regions.push('lidl-romandie');
  if (/suisse al[ée]manique|deutschschweiz/.test(t)) regions.push('lidl-deutschschweiz');
  const note = /\(([^)]*uniquement[^)]*)\)/i.exec(text)?.[1] ?? /(cette action est uniquement valable[^.]*)/i.exec(text)?.[1] ?? null;
  return regions.length ? { regions, note, unknown: false } : { regions: null, note, unknown: true };
}

export type LidlOfferMechanic =
  | { type: 'price' }
  | { type: 'nth_percent'; buyQty: number; percent: number }
  | { type: 'conditional' };

/**
 * Mécanique d'une action d'après son bandeau et sa description : prix unitaire inconditionnel,
 * rabais sur le N-ième paquet (« -50% sur le 2e paquet » : le prix affiché est celui du 2e paquet),
 * ou prix conditionnel jamais appliqué automatiquement au panier (« Dès », « Jusqu'à -46% »,
 * contenance variable « 250-500 ml », « 2+1 gratuit » lorsque le lot n'est pas l'article vendu).
 */
export function offerMechanic(mechanic: string | null, packText: string): LidlOfferMechanic {
  const t = (mechanic ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
  const nth = /(\d+(?:[.,]\d+)?)\s*%\s*sur le (\d+)\s*(?:e|ème|eme)\b/.exec(t);
  if (nth) return { type: 'nth_percent', percent: Number((nth[1] as string).replace(',', '.')), buyQty: Number(nth[2]) };
  const free = /(\d+)\s*\+\s*(\d+)\s*gratuit/.exec(t);
  if (free) {
    // « 2+1 gratuit » : prix du lot de 3 lorsque l'article vendu est ce lot (« 3 x 2 kg »).
    const lot = Number(free[1]) + Number(free[2]);
    return new RegExp(`(^|\\|)\\s*${lot}\\s*x\\s`, 'i').test(packText) ? { type: 'price' } : { type: 'conditional' };
  }
  if (/^(dès|des|ab|da)\b|jusqu|bis zu|fino a/.test(t)) return { type: 'conditional' };
  if (/\d\s*-\s*\d+\s*(g|kg|ml|cl|dl|l)\b/i.test(packText)) return { type: 'conditional' };
  return { type: 'price' };
}

export function parseOfferPage(html: string, pageUrl: string): { offers: LidlOffer[]; skipped: string[] } {
  const offers: LidlOffer[] = [];
  const skipped: string[] = [];
  for (const m of html.matchAll(/data-grid-data="([^"]*)"/g)) {
    let d: GridItem;
    try {
      d = JSON.parse(decodeEntities(m[1] as string)) as GridItem;
    } catch {
      skipped.push('JSON illisible');
      continue;
    }
    if (d.category !== 'Food' || !d.erpNumber) continue;
    const title = decodeEntities(d.fullTitle ?? d.title ?? '').trim();
    const descText = textOf((d.keyfacts?.description ?? '').replace(/<\/li>/g, ' | '));
    const region = parseRegions(`${title} ${descText}`);
    if (region.unknown) {
      skipped.push(`Région non reconnue : ${title}`);
      continue;
    }
    const cleanTitle = title.replace(/\s*\([^)]*(valable uniquement|uniquement valable|nur)[^)]*\)\s*/gi, ' ').trim();
    const brandName = d.brand?.showBrand ? (d.brand.name ?? '').trim() : '';
    const brand = brandName && !QUALITY_BRANDS.test(brandName) ? brandName : null;
    const lp = d.lidlPlus?.[0]?.price;
    const main = d.price;
    const priceCents = cents(main?.price);
    const lidlPlusPriceCents = cents(lp?.price);
    if (priceCents === null && lidlPlusPriceCents === null) {
      skipped.push(`Sans prix : ${title}`);
      continue;
    }
    const badge = d.stockAvailability?.badgeInfoV2?.[0];
    const start = d.storeStartDate ?? badge?.validFrom ?? null;
    const end = d.storeEndDate ?? badge?.validUntil ?? null;
    const lowered = `${title} ${descText}`.toLowerCase();
    offers.push({
      erpNumber: d.erpNumber,
      name: cleanTitle,
      brand,
      packText: descText,
      swiss: /origine\s*:\s*suisse|qualit[éè] suisse|suisse\b/.test(lowered) || (d.seals ?? []).some((s) => /suisse/i.test(s.altText ?? '')),
      organic: /\bbio\b/.test(lowered),
      regions: region.regions,
      regionNote: region.note,
      priceCents,
      referencePriceCents: cents(main?.oldPrice) ?? cents(main?.discount?.deletedPrice),
      mechanic: main?.discount?.discountText?.trim() || null,
      lidlPlusPriceCents,
      lidlPlusReferenceCents: cents(lp?.oldPrice) ?? cents(lp?.discount?.deletedPrice),
      validFrom: zurichDateOf(start),
      validTo: zurichDateOf(end),
      renderedAt: d.renderedTs ? new Date(d.renderedTs * 1000).toISOString() : null,
      url: d.canonicalPath ? `${LIDL_WWW_ORIGIN}${d.canonicalPath}` : pageUrl,
    });
  }
  return { offers, skipped };
}

/* ------------------------------------------------------------------ */
/* Lot                                                                 */
/* ------------------------------------------------------------------ */

export interface LidlPages {
  assortment: Array<{ url: string; html: string; fetchedAt: Date }>;
  offers: Array<{ url: string; html: string; fetchedAt: Date }>;
  /** Fiches produits (rotation quotidienne sur le plan du site). */
  products?: Array<{ url: string; html: string; fetchedAt: Date }>;
}

/** Transforme les pages lues en lot (pur, testable hors ligne). */
export function buildLidlBatch(pages: LidlPages, ctx: Pick<ConnectorContext, 'now' | 'catalog' | 'reviewedMatches'>): ConnectorBatch {
  const report = emptyReport();
  const today = zurichToday(ctx.now);
  const products = new Map<string, RetailerProduct>();
  const prices = new Map<string, PriceObservation>();
  const promotions = new Map<string, Promotion>();
  const source = (url: string) => ({ connectorId: LIDL_CONNECTOR_ID, kind: 'retailer_site' as const, ref: url });
  let itemsSeen = 0;
  let packUnreadable = 0;
  let unitPriceMismatch = 0;
  let productPagesRead = 0;

  const assortmentSources = [
    ...pages.assortment.map((page) => ({ page, items: parseAssortmentPage(page.html).items })),
    ...(pages.products ?? []).map((page) => {
      const it = parseProductPage(page.html, page.url);
      if (it) productPagesRead++;
      return { page, items: it ? [it] : [] };
    }),
  ];
  for (const { page, items } of assortmentSources) {
    itemsSeen += items.length;
    for (const it of items) {
      const pack = parsePackText(it.packText);
      if (!pack) {
        packUnreadable++;
        report.warnings.push({ message: `Conditionnement illisible « ${it.packText} » : ${it.name} (${it.articleNo})` });
        continue;
      }
      // Contrôle du prix de base publié (hors actions et articles à variantes, où il peut porter
      // sur un autre prix ou une autre contenance) : écart > 35 % → rejet, > 5 % → avertissement.
      const dev = it.isAction || pack.ambiguous ? null : unitPriceDeviation(it.packText, it.priceCents, pack.quantity);
      if (dev !== null && dev > 0.35) {
        unitPriceMismatch++;
        report.rejected.push({ message: `Prix de base incohérent (${(dev * 100).toFixed(0)} %) : ${it.name} ${it.packText}` });
        continue;
      }
      if (dev !== null && dev > 0.05) {
        report.warnings.push({ message: `Prix de base divergent (${(dev * 100).toFixed(0)} %), prix conservé : ${it.name} ${it.packText}` });
      }
      const id = `lidl:${it.articleNo}`;
      // Un même article peut figurer sur une page catégorie et sur sa fiche : les indications
      // d'origine lues sur l'une ou l'autre sont conservées.
      const seen = products.get(id);
      if (seen?.attributes.swissOrigin) it.swiss = true;
      products.set(id, {
        id,
        chainId: 'lidl',
        connectorId: LIDL_CONNECTOR_ID,
        sku: it.articleNo,
        gtin: null,
        name: it.name,
        brand: null,
        quantity: pack.quantity,
        attributes: { organic: /\bbio\b/i.test(it.name), swissOrigin: it.swiss, labels: labelsFromName(it.name, pack.ambiguous) },
        url: it.url,
        isDemo: false,
      });
      const observedAt = page.fetchedAt.toISOString();
      if (it.lidlPlusPriceCents && it.lidlPlusPriceCents < it.priceCents) {
        const lpId = `${LIDL_CONNECTOR_ID}:${it.articleNo}:assort-lp:${today}`;
        promotions.set(lpId, {
          id: lpId,
          retailerProductId: id,
          chainId: 'lidl',
          zoneId: null,
          storeId: null,
          type: 'price',
          promoPriceCents: it.lidlPlusPriceCents,
          loyaltyProgram: 'lidl-plus',
          whileStocksLast: true,
          endIsPresumed: true,
          label: 'Lidl Plus',
          publishedAt: observedAt,
          validFrom: today,
          validTo: today,
          source: source(page.url),
          sourceUrl: it.url,
          verifiedAt: observedAt,
          isDemo: false,
        });
      }
      if (it.isAction) {
        // Prix d'action sans dates publiées : valable le jour du relevé seulement.
        promotions.set(`${LIDL_CONNECTOR_ID}:${it.articleNo}:assort:${today}`, {
          id: `${LIDL_CONNECTOR_ID}:${it.articleNo}:assort:${today}`,
          retailerProductId: id,
          chainId: 'lidl',
          zoneId: null,
          storeId: null,
          type: 'price',
          promoPriceCents: it.priceCents,
          whileStocksLast: true,
          endIsPresumed: true,
          label: 'Action (assortiment)',
          publishedAt: observedAt,
          validFrom: today,
          validTo: today,
          source: source(page.url),
          sourceUrl: it.url,
          verifiedAt: observedAt,
          isDemo: false,
        });
      } else {
        prices.set(`${LIDL_CONNECTOR_ID}:${it.articleNo}:${today}`, {
          id: `${LIDL_CONNECTOR_ID}:${it.articleNo}:${today}`,
          retailerProductId: id,
          zoneId: null,
          storeId: null,
          priceCents: it.priceCents,
          observedAt,
          source: source(page.url),
          isDemo: false,
          priceType: 'regular',
          channel: 'store',
          reliability: 'official',
          license: null,
          sourceUrl: it.url,
          proof: 'web_page',
        });
      }
    }
  }

  let offersSeen = 0;
  let conditionalOffers = 0;
  for (const page of pages.offers) {
    const { offers, skipped } = parseOfferPage(page.html, page.url);
    for (const s of skipped) report.warnings.push({ message: `${page.url} : ${s}` });
    for (const o of offers) {
      offersSeen++;
      const pack = parsePackText(o.packText);
      if (!pack) {
        packUnreadable++;
        report.warnings.push({ message: `Conditionnement illisible « ${o.packText} » : ${o.name} (${o.erpNumber})` });
        continue;
      }
      const validFrom = o.validFrom ?? today;
      const endIsPresumed = !o.validTo;
      // Sans date de fin publiée : cycle hebdomadaire Lidl (jeudi → mercredi), fin présumée.
      const validTo = o.validTo ?? addDays(validFrom, 6);
      if (validTo < today) continue;
      const id = `lidl:offer-${o.erpNumber}`;
      products.set(id, {
        id,
        chainId: 'lidl',
        connectorId: LIDL_CONNECTOR_ID,
        sku: `offer-${o.erpNumber}`,
        gtin: null,
        name: o.name,
        brand: o.brand,
        quantity: pack.quantity,
        attributes: { organic: o.organic, swissOrigin: o.swiss, labels: labelsFromName(`${o.name} ${o.packText}`, pack.ambiguous) },
        url: o.url,
        isDemo: false,
      });
      const fetchedIso = page.fetchedAt.toISOString();
      const publishedAt = o.renderedAt && o.renderedAt < fetchedIso ? o.renderedAt : fetchedIso;
      const zones: Array<string | null> = o.regions ?? [null];
      const variants: Array<{ key: string; price: number | null; ref: number | null; loyalty: string | null }> = [
        { key: 'std', price: o.priceCents, ref: o.referencePriceCents, loyalty: null },
        { key: 'lp', price: o.lidlPlusPriceCents, ref: o.lidlPlusReferenceCents, loyalty: 'lidl-plus' },
      ];
      const mech = offerMechanic(o.mechanic, o.packText);
      if (mech.type !== 'price') conditionalOffers++;
      for (const zoneId of zones) {
        for (const v of variants) {
          if (v.price === null) continue;
          const pid = `${LIDL_CONNECTOR_ID}:${o.erpNumber}:${validFrom}:${zoneId ?? 'ch'}:${v.key}`;
          // Le prix Lidl Plus est un prix unitaire, sauf contenance variable.
          const m: LidlOfferMechanic = v.loyalty && mech.type === 'nth_percent' ? { type: 'price' } : mech;
          promotions.set(pid, {
            id: pid,
            retailerProductId: id,
            chainId: 'lidl',
            zoneId,
            storeId: null,
            type: m.type,
            // « -50% sur le 2e paquet » : le prix affiché est celui du 2e paquet, pas un prix unitaire.
            promoPriceCents: m.type === 'nth_percent' ? null : v.price,
            percent: m.type === 'nth_percent' ? m.percent : null,
            buyQty: m.type === 'nth_percent' ? m.buyQty : null,
            referencePriceCents: v.ref && v.ref > v.price ? v.ref : null,
            loyaltyProgram: v.loyalty,
            whileStocksLast: true,
            endIsPresumed,
            label: v.loyalty ? 'Lidl Plus' : o.mechanic,
            regionNote: o.regionNote,
            publishedAt,
            validFrom,
            validTo,
            source: source(page.url),
            sourceUrl: o.url,
            verifiedAt: fetchedIso,
            isDemo: false,
          });
        }
        // Prix « au lieu de » communiqué par Lidl : dernier prix normal connu.
        if (o.referencePriceCents && o.priceCents && o.referencePriceCents > o.priceCents) {
          const oid = `${LIDL_CONNECTOR_ID}:offer-${o.erpNumber}:${zoneId ?? 'ch'}:${today}`;
          prices.set(oid, {
            id: oid,
            retailerProductId: id,
            zoneId,
            storeId: null,
            priceCents: o.referencePriceCents,
            observedAt: fetchedIso,
            source: source(page.url),
            isDemo: false,
            priceType: 'regular',
            channel: 'store',
            reliability: 'official',
            license: null,
            sourceUrl: o.url,
            proof: 'web_page',
          });
        }
      }
    }
  }

  const retailerProducts = [...products.values()];
  const { matches, reviewedCount } = matchesFor(retailerProducts, ctx.catalog ?? PRODUCTS, ctx.reviewedMatches);
  report.accepted = { products: retailerProducts.length, prices: prices.size, promotions: promotions.size, matches: matches.length };
  report.metrics = {
    assortmentPages: pages.assortment.length,
    productPages: pages.products?.length ?? 0,
    productPagesRead,
    offerPages: pages.offers.length,
    assortmentItems: itemsSeen,
    offers: offersSeen,
    conditionalOffers,
    packUnreadable,
    unitPriceMismatch,
    reviewedProducts: reviewedCount,
  };
  return {
    connectorId: LIDL_CONNECTOR_ID,
    retailerProducts,
    matches,
    prices: [...prices.values()],
    promotions: [...promotions.values()],
    report,
  };
}

/* ------------------------------------------------------------------ */
/* Connecteur                                                          */
/* ------------------------------------------------------------------ */

export class LidlWebConnector implements PriceConnector {
  readonly id = LIDL_CONNECTOR_ID;
  readonly label = 'Lidl — site officiel (assortiment et actions)';
  readonly chainIds = ['lidl'];
  readonly sourceKind = 'retailer_site' as const;

  async status(ctx: Pick<ConnectorContext, 'env'>): Promise<ConnectorStatus> {
    if (ctx.env?.LIDL_WEB === 'off') return { state: 'disabled', message: 'Désactivé (LIDL_WEB=off)' };
    return { state: 'ready', message: 'Pages publiques officielles, robots.txt respecté' };
  }

  async run(ctx: ConnectorContext): Promise<ConnectorBatch> {
    const fetcher = requireFetcher(ctx);
    const maxCategories = Number(ctx.env?.LIDL_MAX_CATEGORIES ?? '0') || Number.POSITIVE_INFINITY;
    const pages: LidlPages = { assortment: [], offers: [] };
    const failures: string[] = [];

    // Plan du site : relu au plus une fois par semaine (cache local), il change rarement et pèse ~2 Mo.
    const sitemap = await fetcher.getCached(`${LIDL_ASSORTMENT_ORIGIN}/sitemaps/fr.xml`, 7 * 86_400_000, 'application/xml');
    const targeted = Boolean(ctx.targets);
    const categories = discoverAssortmentCategories(sitemap.body)
      .filter((u) => !targeted || LIDL_CORE_CATEGORY.test(new URL(u).pathname))
      .slice(0, maxCategories);
    for (const url of categories) {
      if (ctx.signal?.aborted) break;
      try {
        const r = await fetcher.get(url);
        pages.assortment.push({ url, html: r.body, fetchedAt: r.fetchedAt });
      } catch (e) {
        if (e instanceof HttpBlockedError && e.reason !== 'robots') throw e;
        failures.push(`${url} : ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    // Fiches produits. Collecte ciblée : fiches déjà reliées au noyau (chaque jour), plus une petite
    // tranche de découverte (LIDL_DISCOVERY_PAGES_PER_RUN, défaut 0). Collecte complète : tranche du
    // jour de la rotation (défaut 460 fiches, soit tout l'assortiment en 7 jours).
    const all = discoverProductPages(sitemap.body);
    const listed = new Set(all.map((u) => lidlProductPageUrl(u)));
    const perRun = Number(targeted ? (ctx.env?.LIDL_DISCOVERY_PAGES_PER_RUN ?? '0') : (ctx.env?.LIDL_PRODUCT_PAGES_PER_RUN ?? '460'));
    const rotation = rotationSlice(all, Number.isFinite(perRun) ? perRun : 0, ctx.now);
    const targetPages = [...new Set((ctx.targets?.productUrls ?? []).map(lidlProductPageUrl).filter((u): u is string => Boolean(u) && listed.has(u)))];
    const productUrls = [...new Set([...targetPages, ...rotation.slice.map((u) => lidlProductPageUrl(u) ?? u)])];
    pages.products = [];
    for (const url of productUrls) {
      if (ctx.signal?.aborted) break;
      try {
        const r = await fetcher.get(url);
        pages.products.push({ url, html: r.body, fetchedAt: r.fetchedAt });
      } catch (e) {
        if (e instanceof HttpBlockedError && e.reason !== 'robots') throw e;
        failures.push(`${url} : ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    try {
      const home = await fetcher.get(`${LIDL_WWW_ORIGIN}/fr-CH/`);
      for (const url of discoverOfferPages(home.body)) {
        if (ctx.signal?.aborted) break;
        try {
          const r = await fetcher.get(url);
          pages.offers.push({ url, html: r.body, fetchedAt: r.fetchedAt });
        } catch (e) {
          if (e instanceof HttpBlockedError && e.reason !== 'robots') throw e;
          failures.push(`${url} : ${e instanceof Error ? e.message : String(e)}`);
        }
      }
    } catch (e) {
      if (e instanceof HttpBlockedError) throw e;
      failures.push(`Page d'accueil des actions : ${e instanceof Error ? e.message : String(e)}`);
    }

    const batch = buildLidlBatch(pages, ctx);
    for (const f of failures) batch.report.warnings.push({ message: f });
    batch.report.metrics = {
      ...batch.report.metrics,
      categoriesListed: categories.length,
      mode: targeted ? 'noyau' : 'complet',
      targetProductPages: targetPages.length,
      productRotation: rotation.chunks ? `${rotation.chunk + 1}/${rotation.chunks}` : 'off',
      pageFailures: failures.length,
    };
    ctx.log.info('Lidl : collecte terminée', batch.report.metrics);
    return batch;
  }
}
