/**
 * Import structuré (CSV ou JSON) — voie de collecte conforme lorsqu'aucune API
 * autorisée n'existe : relevés manuels, fichiers fournis par une enseigne, etc.
 *
 * Règles de validation (voir docs/DONNEES.md) :
 * - chaque prix a une source (`source_kind`, `source_ref`) et une date de vérification ;
 * - `source_kind = demo` est refusé (réservé au générateur de démonstration) ;
 * - les enseignes « prix particuliers uniquement » (Aligro) exigent
 *   `audience = consumer` et `vat_included = true` ;
 * - aucune date de vérification ou de publication dans le futur ;
 * - une promotion a une période valide et une date de publication.
 */

import {
  chfToCents,
  isIsoDate,
  normalizeQuantity,
  suggestMatches,
  zurichLocalToInstant,
  type CanonicalProduct,
  type Chain,
  type DataSource,
  type MatchKind,
  type PriceObservation,
  type ProductMatch,
  type Promotion,
  type PromotionType,
  type RetailerProduct,
  type SourceKind,
} from '@cabas/core';
import { CHAINS, PRICE_ZONES, PRODUCTS } from '@cabas/reference';
import { parseCsv } from './csv';
import { hash32 } from './rng';
import { emptyReport, type ConnectorBatch, type ImportIssue } from './types';

const ALLOWED_SOURCES: SourceKind[] = ['official_api', 'agreement', 'manual_survey', 'manual_import'];
const PROMO_TYPES: PromotionType[] = ['price', 'percent', 'multibuy', 'min_qty_price', 'min_qty_percent'];
const MATCH_KINDS: MatchKind[] = ['gtin', 'equivalent', 'similar'];

export interface ImportOptions {
  connectorId: string;
  now: Date;
  /** Restreint l'import à une enseigne (connecteur d'enseigne). */
  chainId?: string;
  /** Nom du fichier (pour les messages d'erreur). */
  fileName?: string;
  catalog?: CanonicalProduct[];
  chains?: Chain[];
}

type Raw = Record<string, unknown>;

class RowError extends Error {
  constructor(
    public field: string,
    message: string,
  ) {
    super(message);
  }
}

function str(row: Raw, field: string, required = false): string | null {
  const v = row[field];
  const s = v === undefined || v === null ? '' : String(v).trim();
  if (!s) {
    if (required) throw new RowError(field, `Champ obligatoire manquant : ${field}`);
    return null;
  }
  return s;
}

function num(row: Raw, field: string, required = false): number | null {
  const s = str(row, field, required);
  if (s === null) return null;
  const n = Number(s.replace(/'/g, '').replace(',', '.'));
  if (!Number.isFinite(n)) throw new RowError(field, `Nombre invalide : ${s}`);
  return n;
}

function bool(row: Raw, field: string, fallback: boolean): boolean {
  const s = str(row, field);
  if (s === null) return fallback;
  const v = s.toLowerCase();
  if (['1', 'true', 'oui', 'yes', 'ja', 'vrai'].includes(v)) return true;
  if (['0', 'false', 'non', 'no', 'nein', 'faux'].includes(v)) return false;
  throw new RowError(field, `Valeur booléenne invalide : ${s}`);
}

/** Date ISO (YYYY-MM-DD → 12:00 heure de Zurich) ou instant ISO complet. */
function instant(row: Raw, field: string, now: Date, required = true): string | null {
  const s = str(row, field, required);
  if (s === null) return null;
  let t: number;
  if (isIsoDate(s)) t = zurichLocalToInstant(s, '12:00').getTime();
  else {
    t = Date.parse(s);
    if (!/^\d{4}-\d{2}-\d{2}T/.test(s) || !Number.isFinite(t)) throw new RowError(field, `Date invalide : ${s}`);
  }
  if (t > now.getTime() + 3600_000) throw new RowError(field, `Date dans le futur refusée : ${s}`);
  return new Date(t).toISOString();
}

function calendarDate(row: Raw, field: string): string {
  const s = str(row, field, true) as string;
  if (!isIsoDate(s)) throw new RowError(field, `Date calendaire attendue (AAAA-MM-JJ) : ${s}`);
  return s;
}

/** Contrôle de la clé GTIN/EAN (8, 12, 13 ou 14 chiffres). */
export function isValidGtin(gtin: string): boolean {
  if (!/^(\d{8}|\d{12}|\d{13}|\d{14})$/.test(gtin)) return false;
  const digits = gtin.split('').map(Number);
  const check = digits.pop() as number;
  const sum = digits.reverse().reduce((acc, d, i) => acc + d * (i % 2 === 0 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === check;
}

function parseScope(row: Raw, chainId: string): { zoneId: string | null; storeId: string | null } {
  const s = str(row, 'scope') ?? 'national';
  if (s === 'national') return { zoneId: null, storeId: null };
  if (s.startsWith('zone:')) {
    const zoneId = s.slice(5);
    if (!PRICE_ZONES.some((z) => z.id === zoneId && z.chainId === chainId)) {
      throw new RowError('scope', `Zone inconnue pour ${chainId} : ${zoneId}`);
    }
    return { zoneId, storeId: null };
  }
  if (s.startsWith('store:')) return { zoneId: null, storeId: s.slice(6) };
  throw new RowError('scope', `Portée invalide : ${s} (national | zone:<id> | store:<id>)`);
}

function parseSource(row: Raw, connectorId: string): DataSource {
  const kind = str(row, 'source_kind', true) as SourceKind;
  if (!ALLOWED_SOURCES.includes(kind)) {
    throw new RowError('source_kind', `Type de source refusé : ${kind} (${ALLOWED_SOURCES.join(', ')})`);
  }
  const ref = str(row, 'source_ref', true) as string;
  return { connectorId, kind, ref };
}

/**
 * Garde-fou : les fichiers d'exemple (source commençant par « EXEMPLE ») sont
 * toujours traités comme des données fictives, même s'ils sont importés par erreur.
 */
export function isExampleSource(ref: string | null | undefined): boolean {
  return /^\s*EXEMPLE/i.test(ref ?? '');
}

export function retailerProductId(chainId: string, sku: string): string {
  return `${chainId}:${sku}`;
}

export interface ParsedImport {
  batch: ConnectorBatch;
}

/**
 * Transforme des lignes brutes (issues d'un CSV ou d'un JSON) en lot validé.
 * Les lignes invalides sont écartées et listées dans le rapport.
 */
export function buildBatchFromRows(
  input: { products?: Array<{ line: number; values: Raw }>; promotions?: Array<{ line: number; values: Raw }> },
  opts: ImportOptions,
): ConnectorBatch {
  const report = emptyReport();
  const chains = opts.chains ?? CHAINS;
  const catalog = opts.catalog ?? PRODUCTS;
  const catalogBySlug = new Map(catalog.map((c) => [c.slug, c]));
  const products = new Map<string, RetailerProduct>();
  const matches: ProductMatch[] = [];
  const prices: PriceObservation[] = [];
  const promotions: Promotion[] = [];
  const reject = (line: number, e: unknown) => {
    const issue: ImportIssue = { file: opts.fileName, line, message: e instanceof Error ? e.message : String(e) };
    if (e instanceof RowError) issue.field = e.field;
    report.rejected.push(issue);
  };
  const chainOf = (row: Raw): Chain => {
    const chainId = str(row, 'chain_id', true) as string;
    const chain = chains.find((c) => c.id === chainId);
    if (!chain) throw new RowError('chain_id', `Enseigne inconnue : ${chainId}`);
    if (opts.chainId && chainId !== opts.chainId) {
      throw new RowError('chain_id', `Ce connecteur n'accepte que l'enseigne ${opts.chainId}`);
    }
    return chain;
  };

  for (const { line, values: row } of input.products ?? []) {
    try {
      const chain = chainOf(row);
      const sku = str(row, 'sku', true) as string;
      const name = str(row, 'name', true) as string;
      const quantity = normalizeQuantity(num(row, 'quantity', true) as number, str(row, 'unit', true) as string);
      const gtin = str(row, 'gtin');
      if (gtin && !isValidGtin(gtin)) throw new RowError('gtin', `Code GTIN/EAN invalide : ${gtin}`);
      if (chain.consumerPricesOnly) {
        if ((str(row, 'audience') ?? '') !== 'consumer') {
          throw new RowError('audience', `${chain.name} : seuls les prix accessibles aux particuliers sont admis (audience=consumer)`);
        }
        if (!bool(row, 'vat_included', false)) {
          throw new RowError('vat_included', `${chain.name} : prix TTC obligatoires (vat_included=true)`);
        }
      } else if ((str(row, 'audience') ?? 'consumer') !== 'consumer') {
        throw new RowError('audience', 'Seuls les prix destinés aux consommateurs sont admis');
      } else if (!bool(row, 'vat_included', true)) {
        throw new RowError('vat_included', 'Les prix doivent inclure la TVA (OIP art. 3-4)');
      }
      const id = retailerProductId(chain.id, sku);
      const labels = (str(row, 'labels') ?? '')
        .split('|')
        .map((l) => l.trim())
        .filter(Boolean);
      const rp: RetailerProduct = {
        id,
        chainId: chain.id,
        connectorId: opts.connectorId,
        sku,
        gtin,
        name,
        brand: str(row, 'brand'),
        quantity,
        attributes: {
          organic: bool(row, 'organic', false),
          swissOrigin: bool(row, 'swiss_origin', false),
          labels,
        },
        url: str(row, 'url'),
        isDemo: false,
      };
      const example = isExampleSource(str(row, 'source_ref'));
      if (example) rp.isDemo = true;
      const priceChf = num(row, 'price_chf');
      let observation: PriceObservation | null = null;
      if (priceChf !== null) {
        if (priceChf <= 0 || priceChf > 10000) throw new RowError('price_chf', `Prix hors limites : ${priceChf}`);
        const observedAt = instant(row, 'observed_at', opts.now) as string;
        const scope = parseScope(row, chain.id);
        observation = {
          id: `${id}:${scope.zoneId ?? scope.storeId ?? 'national'}:${observedAt}`,
          retailerProductId: id,
          ...scope,
          priceCents: chfToCents(priceChf),
          observedAt,
          source: parseSource(row, opts.connectorId),
          isDemo: example,
        };
      } else {
        report.warnings.push({ file: opts.fileName, line, message: `Article ${sku} importé sans prix` });
      }

      // Correspondance avec le catalogue normalisé.
      const slug = str(row, 'canonical_slug');
      const kindRaw = str(row, 'match_kind');
      if (kindRaw && !MATCH_KINDS.includes(kindRaw as MatchKind)) {
        throw new RowError('match_kind', `Type de correspondance invalide : ${kindRaw}`);
      }
      if (slug) {
        const canonical = catalogBySlug.get(slug);
        if (!canonical) {
          report.warnings.push({ file: opts.fileName, line, field: 'canonical_slug', message: `Référence inconnue : ${slug}` });
        } else if (canonical.quantity.unit !== quantity.unit) {
          throw new RowError('canonical_slug', `Unités incompatibles avec ${slug}`);
        } else {
          const ratio = quantity.amount / canonical.quantity.amount;
          const kind = (kindRaw as MatchKind) ?? (ratio >= 0.9 && ratio <= 1.1 ? 'equivalent' : 'similar');
          matches.push({ canonicalId: canonical.id, retailerProductId: id, kind, status: 'validated', confidence: 1 });
        }
      }
      if (!slug || !catalogBySlug.has(slug)) {
        for (const s of suggestMatches(rp, catalog)) {
          matches.push({
            canonicalId: s.canonicalId,
            retailerProductId: id,
            kind: s.kind,
            status: s.autoValidate ? 'validated' : 'suggested',
            confidence: s.confidence,
          });
        }
      }
      products.set(id, rp);
      if (observation) prices.push(observation);
    } catch (e) {
      reject(line, e);
    }
  }

  for (const { line, values: row } of input.promotions ?? []) {
    try {
      const chain = chainOf(row);
      const sku = str(row, 'sku', true) as string;
      const type = str(row, 'type', true) as PromotionType;
      if (!PROMO_TYPES.includes(type)) throw new RowError('type', `Type de promotion invalide : ${type}`);
      const validFrom = calendarDate(row, 'valid_from');
      const validTo = calendarDate(row, 'valid_to');
      if (validTo < validFrom) throw new RowError('valid_to', 'Fin de validité antérieure au début');
      const publishedAt = instant(row, 'published_at', opts.now) as string;
      if (publishedAt.slice(0, 10) > validTo) throw new RowError('published_at', 'Publication postérieure à la fin de validité');
      const promoPrice = num(row, 'promo_price_chf');
      const percent = num(row, 'percent');
      const buyQty = num(row, 'buy_qty');
      const payQty = num(row, 'pay_qty');
      const minQty = num(row, 'min_qty');
      if ((type === 'price' || type === 'min_qty_price') && (promoPrice === null || promoPrice <= 0)) {
        throw new RowError('promo_price_chf', 'Prix promotionnel requis');
      }
      if ((type === 'percent' || type === 'min_qty_percent') && (percent === null || percent <= 0 || percent >= 100)) {
        throw new RowError('percent', 'Pourcentage requis (entre 0 et 100)');
      }
      if (type === 'multibuy' && !(buyQty && payQty !== null && buyQty > payQty && payQty >= 1)) {
        throw new RowError('buy_qty', 'Offre « X pour Y » invalide');
      }
      if ((type === 'min_qty_price' || type === 'min_qty_percent') && !(minQty && minQty >= 2)) {
        throw new RowError('min_qty', 'Quantité minimale requise (≥ 2)');
      }
      const loyalty = str(row, 'loyalty_program');
      if (loyalty && !chain.loyaltyPrograms.some((l) => l.id === loyalty)) {
        report.warnings.push({ file: opts.fileName, line, field: 'loyalty_program', message: `Programme inconnu pour ${chain.name} : ${loyalty}` });
      }
      const scope = parseScope(row, chain.id);
      const referencePrice = num(row, 'reference_price_chf');
      const id = retailerProductId(chain.id, sku);
      promotions.push({
        id: `${id}:${type}:${validFrom}:${hash32(`${scope.zoneId}:${scope.storeId}:${loyalty}`).toString(36)}`,
        retailerProductId: id,
        chainId: chain.id,
        ...scope,
        type,
        promoPriceCents: promoPrice !== null ? chfToCents(promoPrice) : null,
        percent,
        buyQty,
        payQty,
        minQty,
        referencePriceCents: referencePrice !== null ? chfToCents(referencePrice) : null,
        loyaltyProgram: loyalty,
        whileStocksLast: bool(row, 'while_stocks_last', false),
        endIsPresumed: bool(row, 'end_is_presumed', false),
        label: str(row, 'label'),
        publishedAt,
        validFrom,
        validTo,
        source: parseSource(row, opts.connectorId),
        verifiedAt: instant(row, 'verified_at', opts.now, false) ?? publishedAt,
        isDemo: isExampleSource(str(row, 'source_ref')),
      });
    } catch (e) {
      reject(line, e);
    }
  }

  report.accepted = {
    products: products.size,
    prices: prices.length,
    promotions: promotions.length,
    matches: matches.length,
  };
  return {
    connectorId: opts.connectorId,
    retailerProducts: [...products.values()],
    matches,
    prices,
    promotions,
    report,
  };
}

/** Détecte le type de fichier (articles/prix ou promotions) d'après les colonnes. */
export function parseImportFile(content: string, fileName: string, opts: ImportOptions): ConnectorBatch {
  const o = { ...opts, fileName };
  if (fileName.toLowerCase().endsWith('.json')) {
    let data: unknown;
    try {
      data = JSON.parse(content);
    } catch {
      const r = emptyReport();
      r.rejected.push({ file: fileName, message: 'JSON invalide' });
      return { connectorId: opts.connectorId, retailerProducts: [], matches: [], prices: [], promotions: [], report: r };
    }
    const obj = (data ?? {}) as { products?: Raw[]; promotions?: Raw[] };
    return buildBatchFromRows(
      {
        products: (obj.products ?? []).map((values, i) => ({ line: i + 1, values })),
        promotions: (obj.promotions ?? []).map((values, i) => ({ line: i + 1, values })),
      },
      o,
    );
  }
  const { headers, rows } = parseCsv(content);
  const isPromo = headers.includes('valid_from') && headers.includes('type');
  return buildBatchFromRows(isPromo ? { promotions: rows } : { products: rows }, o);
}

/** Fusionne plusieurs lots (ex. fichier des prix + fichier des promotions). */
export function mergeBatches(connectorId: string, batches: ConnectorBatch[]): ConnectorBatch {
  const merged: ConnectorBatch = {
    connectorId,
    retailerProducts: [],
    matches: [],
    prices: [],
    promotions: [],
    report: emptyReport(),
  };
  for (const b of batches) {
    merged.retailerProducts.push(...b.retailerProducts);
    merged.matches.push(...b.matches);
    merged.prices.push(...b.prices);
    merged.promotions.push(...b.promotions);
    merged.report.rejected.push(...b.report.rejected);
    merged.report.warnings.push(...b.report.warnings);
  }
  // Une promotion doit porter sur un article connu du lot (les articles existants en base
  // sont vérifiés par la couche de persistance).
  merged.report.accepted = {
    products: merged.retailerProducts.length,
    prices: merged.prices.length,
    promotions: merged.promotions.length,
    matches: merged.matches.length,
  };
  return merged;
}
