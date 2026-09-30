import {
  chfToCents,
  isIsoDate,
  meetsRequirements,
  normalizeQuantity,
  VARIABLE_WEIGHT_LABEL,
  zurichLocalToInstant,
  type CanonicalProduct,
  type Chain,
  type PriceObservation,
  type Promotion,
  type Quantity,
  type RetailerProduct,
  type Store,
} from '@cabas/core';
import { CHAINS, PRODUCTS } from '@cabas/reference';
import { parseCsv } from './csv';
import { isExampleSource } from './file-import';
import { hash32 } from './rng';
import { emptyReport, type ConnectorBatch, type ImportIssue } from './types';

/**
 * Relevés de prix en magasin (docs/RELEVES.md) : saisis par l'exploitant ou des bénévoles dans un
 * fichier CSV en français (`data/releves/*.csv`), à partir d'étiquettes de rayon ou de tickets de
 * caisse. Voie gratuite pour les enseignes sans source officielle réutilisable (Migros, Coop, Denner).
 *
 * Règles :
 * - un prix = une enseigne, **un magasin** (identifiant OSM), un jour, un besoin du catalogue et une
 *   preuve (photo, ticket, note) : il ne vaut que pour ce magasin, jamais pour la région ou le pays ;
 * - prix normal et prix d'action sont distincts ; une action sans date de fin affichée ne vaut que
 *   le jour du relevé (aucune date de fin inventée) ;
 * - contenance obligatoire, sauf article vendu au poids ou à la pièce (prix au kilo ou à la pièce) ;
 * - aucune date future ; les lignes « EXEMPLE » (modèle) sont ignorées.
 */

export const RELEVES_CONNECTOR_ID = 'releves';

/** Colonnes du modèle `data/releves/modele.csv`, dans l'ordre. */
export const RELEVE_COLUMNS = [
  'enseigne',
  'magasin',
  'date',
  'besoin',
  'article',
  'marque',
  'contenance',
  'unite',
  'au_poids',
  'prix_chf',
  'prix_action_chf',
  'action_du',
  'action_au',
  'carte',
  'bio',
  'suisse',
  'preuve',
  'releve_par',
] as const;

export interface ReleveOptions {
  now: Date;
  /** Succursales connues (instantané OSM) : le magasin d'un relevé doit y figurer. */
  stores: Store[];
  catalog?: CanonicalProduct[];
  chains?: Chain[];
}

type Row = Record<string, unknown>;

class RowError extends Error {
  constructor(
    public field: string,
    message: string,
  ) {
    super(message);
  }
}

function text(row: Row, field: string, required = false): string | null {
  const v = row[field];
  const s = v === undefined || v === null ? '' : String(v).trim();
  if (!s && required) throw new RowError(field, `Colonne « ${field} » obligatoire`);
  return s || null;
}

function chf(row: Row, field: string): number | null {
  const s = text(row, field);
  if (s === null) return null;
  const n = Number(s.replace(/'/g, '').replace(/\s/g, '').replace(',', '.'));
  if (!Number.isFinite(n) || n <= 0 || n > 1000) throw new RowError(field, `Prix invalide : ${s}`);
  return n;
}

function yes(row: Row, field: string): boolean {
  const s = (text(row, field) ?? '').toLowerCase();
  if (!s || ['non', 'no', 'nein', '0', 'faux'].includes(s)) return false;
  if (['oui', 'yes', 'ja', '1', 'vrai', 'x'].includes(s)) return true;
  throw new RowError(field, `Répondre « oui » ou « non » : ${s}`);
}

function day(row: Row, field: string, required: boolean): string | null {
  const s = text(row, field, required);
  if (s === null) return null;
  const iso = /^\d{2}\.\d{2}\.\d{4}$/.test(s) ? `${s.slice(6)}-${s.slice(3, 5)}-${s.slice(0, 2)}` : s;
  if (!isIsoDate(iso)) throw new RowError(field, `Date attendue (AAAA-MM-JJ ou JJ.MM.AAAA) : ${s}`);
  return iso;
}

/** Quantité de l'article relevé ; pour la vente au poids, la quantité du besoin (montant estimé). */
function quantityOf(row: Row, canonical: CanonicalProduct, loose: boolean): { quantity: Quantity; factor: number } {
  const unit = (text(row, 'unite', true) as string).toLowerCase();
  if (loose) {
    if (unit === 'kg' && canonical.quantity.unit === 'g') return { quantity: canonical.quantity, factor: canonical.quantity.amount / 1000 };
    if (['pce', 'piece', 'pièce', 'pc'].includes(unit) && canonical.quantity.unit === 'piece') return { quantity: canonical.quantity, factor: 1 };
    throw new RowError('unite', `Vente au poids : prix au « kg » (ou à la « pce ») compatible avec le besoin ${canonical.slug}`);
  }
  const amount = Number((text(row, 'contenance', true) as string).replace(',', '.'));
  if (!Number.isFinite(amount) || amount <= 0) throw new RowError('contenance', 'Contenance invalide');
  let quantity: Quantity;
  try {
    quantity = normalizeQuantity(amount, unit);
  } catch {
    throw new RowError('unite', `Unité inconnue : ${unit} (g, kg, ml, cl, l, pce)`);
  }
  if (quantity.unit !== canonical.quantity.unit) throw new RowError('unite', `Unité incompatible avec le besoin ${canonical.slug} (${canonical.quantity.unit})`);
  return { quantity, factor: 1 };
}

/** Mentions reconnues dans la désignation (reprise telle qu'affichée en rayon). */
function labelsFromName(name: string): string[] {
  const labels: string[] = [];
  if (/\b(AOP|AOC|GUB|DOP)\b/i.test(name)) labels.push('aop');
  if (/sans lactose|laktosefrei|lactose[- ]free/i.test(name)) labels.push('lactose-free');
  return labels;
}

function requirementText(c: CanonicalProduct): string {
  return [c.attributes.swissOrigin ? 'suisse = oui' : '', c.attributes.organic ? 'bio = oui' : '', ...(c.attributes.labels ?? []).map((l) => `« ${l.toUpperCase()} » dans la désignation`)].filter(Boolean).join(', ') || 'unité';
}

/** Lit un ou plusieurs fichiers de relevés et construit le lot (lignes invalides écartées et listées). */
export function buildRelevesBatch(files: Array<{ name: string; content: string }>, opts: ReleveOptions): ConnectorBatch {
  const report = emptyReport();
  const chains = opts.chains ?? CHAINS;
  const bySlug = new Map((opts.catalog ?? PRODUCTS).map((c) => [c.slug, c]));
  const storesById = new Map(opts.stores.map((s) => [s.id, s]));
  const today = opts.now.toISOString().slice(0, 10);
  const products = new Map<string, RetailerProduct>();
  const prices = new Map<string, PriceObservation>();
  const promotions = new Map<string, Promotion>();
  let ignoredExamples = 0;

  for (const file of files) {
    const { headers, rows } = parseCsv(file.content);
    const missing = RELEVE_COLUMNS.filter((c) => !['marque', 'au_poids', 'prix_action_chf', 'action_du', 'action_au', 'carte', 'bio', 'suisse', 'releve_par', 'contenance'].includes(c) && !headers.includes(c));
    if (missing.length) {
      report.rejected.push({ file: file.name, message: `Colonnes manquantes : ${missing.join(', ')} (voir data/releves/modele.csv)` });
      continue;
    }
    for (const { line, values: row } of rows) {
      try {
        if (isExampleSource(text(row, 'preuve')) || isExampleSource(text(row, 'releve_par'))) {
          ignoredExamples++;
          continue;
        }
        const chainId = (text(row, 'enseigne', true) as string).toLowerCase();
        const chain = chains.find((c) => c.id === chainId);
        if (!chain) throw new RowError('enseigne', `Enseigne inconnue : ${chainId}`);
        const storeId = text(row, 'magasin', true) as string;
        const store = storesById.get(storeId);
        if (!store) throw new RowError('magasin', `Magasin inconnu : ${storeId} (identifiant donné par « pnpm job magasins --npa=… »)`);
        if (store.chainId !== chain.id) throw new RowError('magasin', `Le magasin ${storeId} n'est pas un magasin ${chain.name}`);
        const date = day(row, 'date', true) as string;
        if (date > today) throw new RowError('date', `Date dans le futur : ${date}`);
        const slug = text(row, 'besoin', true) as string;
        const canonical = bySlug.get(slug);
        if (!canonical) throw new RowError('besoin', `Besoin inconnu : ${slug} (liste : docs/RELEVES.md)`);
        const name = text(row, 'article', true) as string;
        const proof = text(row, 'preuve', true) as string;
        const loose = yes(row, 'au_poids');
        const { quantity, factor } = quantityOf(row, canonical, loose);
        const regular = chf(row, 'prix_chf');
        const promo = chf(row, 'prix_action_chf');
        if (regular === null && promo === null) throw new RowError('prix_chf', 'Prix normal ou prix d’action requis');
        if (regular !== null && promo !== null && promo >= regular) throw new RowError('prix_action_chf', 'Prix d’action supérieur ou égal au prix normal');
        const organic = yes(row, 'bio');
        const swiss = yes(row, 'suisse');
        const brand = text(row, 'marque');
        const loyalty = text(row, 'carte');
        if (loyalty && !chain.loyaltyPrograms.some((l) => l.id === loyalty)) {
          throw new RowError('carte', `Carte inconnue pour ${chain.name} : ${loyalty} (${chain.loyaltyPrograms.map((l) => l.id).join(', ') || 'aucune'})`);
        }
        const actionFrom = day(row, 'action_du', false);
        const actionTo = day(row, 'action_au', false);
        if ((actionFrom || actionTo || loyalty) && promo === null) throw new RowError('prix_action_chf', 'Dates d’action ou carte sans prix d’action');

        const key = [slug, name.toLowerCase(), (brand ?? '').toLowerCase(), quantity.amount, quantity.unit, loose, organic, swiss].join('|');
        const sku = `rel-${hash32(key).toString(36)}`;
        const id = `${chain.id}:${sku}`;
        const labels = [...labelsFromName(name), ...(loose && quantity.unit === 'g' ? [VARIABLE_WEIGHT_LABEL] : [])];
        const product: RetailerProduct = {
          id,
          chainId: chain.id,
          connectorId: RELEVES_CONNECTOR_ID,
          sku,
          gtin: null,
          name: loose ? `${name}, ${quantity.unit === 'g' ? 'au kilo' : 'à la pièce'}` : name,
          brand,
          quantity,
          attributes: { organic, swissOrigin: swiss, labels },
          url: null,
          isDemo: false,
          declaredSlug: slug,
        };
        // Exigences du besoin (origine suisse, bio, AOP, sans lactose) : refus explicite plutôt qu'un prix ignoré.
        if (!meetsRequirements(canonical, product)) throw new RowError('besoin', `L'article ne remplit pas les exigences du besoin ${slug} (${requirementText(canonical)})`);
        if (!products.has(id)) products.set(id, product);
        const observedAt = zurichLocalToInstant(date, '12:00').toISOString();
        const who = text(row, 'releve_par');
        const source = { connectorId: RELEVES_CONNECTOR_ID, kind: 'manual_survey' as const, ref: `${file.name}:${line} — ${proof}${who ? ` (${who})` : ''}` };
        const place = [store.name, store.street, store.city].filter(Boolean).join(', ');
        if (regular !== null) {
          const obsId = `${RELEVES_CONNECTOR_ID}:${store.id}:${sku}:${date}`;
          prices.set(obsId, {
            id: obsId,
            retailerProductId: id,
            zoneId: null,
            storeId: store.id,
            priceCents: Math.round(chfToCents(regular) * factor),
            observedAt,
            source,
            isDemo: false,
            priceType: 'regular',
            channel: 'store',
            reliability: 'survey',
            license: null,
            sourceUrl: null,
            observedAtPlace: place,
            proof: /ticket|quittung|beleg|receipt/i.test(proof) ? 'receipt' : 'price_tag',
          });
        }
        if (promo !== null) {
          // Fin non affichée : l'action n'est retenue que pour le jour du relevé.
          const validFrom = actionFrom ?? date;
          const validTo = actionTo ?? date;
          if (validTo < validFrom) throw new RowError('action_au', 'Fin d’action antérieure au début');
          if (validTo < date) throw new RowError('action_au', 'Action déjà terminée le jour du relevé');
          const promoId = `${RELEVES_CONNECTOR_ID}:${store.id}:${sku}:${validFrom}:${loyalty ?? ''}`;
          promotions.set(promoId, {
            id: promoId,
            retailerProductId: id,
            chainId: chain.id,
            zoneId: null,
            storeId: store.id,
            type: 'price',
            promoPriceCents: Math.round(chfToCents(promo) * factor),
            referencePriceCents: regular !== null ? Math.round(chfToCents(regular) * factor) : null,
            loyaltyProgram: loyalty,
            whileStocksLast: false,
            endIsPresumed: false,
            label: actionTo ? 'Action relevée en magasin' : 'Action relevée en magasin, fin non affichée : valable le jour du relevé',
            publishedAt: observedAt,
            validFrom,
            validTo,
            source,
            verifiedAt: observedAt,
            isDemo: false,
          });
        }
      } catch (e) {
        const issue: ImportIssue = { file: file.name, line, message: e instanceof Error ? e.message : String(e) };
        if (e instanceof RowError) issue.field = e.field;
        report.rejected.push(issue);
      }
    }
  }

  const retailerProducts = [...products.values()];
  const byChain: Record<string, number> = {};
  for (const o of prices.values()) {
    const chain = o.retailerProductId.split(':')[0] as string;
    byChain[chain] = (byChain[chain] ?? 0) + 1;
  }
  report.accepted = { products: retailerProducts.length, prices: prices.size, promotions: promotions.size, matches: retailerProducts.length };
  report.metrics = {
    files: files.length,
    stores: new Set([...prices.values()].map((o) => o.storeId)).size,
    needs: new Set(retailerProducts.map((p) => p.declaredSlug)).size,
    rejected: report.rejected.length,
    ignoredExamples,
    ...Object.fromEntries(Object.entries(byChain).map(([k, v]) => [`prices_${k}`, v])),
  };
  return {
    connectorId: RELEVES_CONNECTOR_ID,
    retailerProducts,
    matches: [],
    prices: [...prices.values()],
    promotions: [...promotions.values()],
    report,
  };
}
