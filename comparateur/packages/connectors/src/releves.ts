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
import { CHAINS, P1_ESSENTIALS, PRODUCTS } from '@cabas/reference';
import { parseCsv } from './csv';
import { isExampleSource, isValidGtin } from './file-import';
import { hash32 } from './rng';
import { emptyReport, type ConnectorBatch, type ImportIssue } from './types';

/**
 * Relevés de prix en magasin (docs/RELEVES.md) : saisis par l'exploitant ou des bénévoles dans un
 * fichier CSV en français **privé** (`data/private/releves/*.csv`, preuves dans
 * `data/private/releves/preuves/`), à partir d'étiquettes de rayon ou de tickets de caisse. Voie
 * gratuite pour les enseignes sans source officielle réutilisable (Migros, Coop, Denner).
 *
 * Règles :
 * - un prix = une enseigne, **un magasin** (identifiant OSM), un jour, un besoin du catalogue et une
 *   preuve (photo de l'étiquette ou du ticket) : il ne vaut que pour ce magasin, jamais pour la région
 *   ou le pays, et reste présenté comme local et indicatif ;
 * - prix normal et prix d'action sont distincts ; une action sans date de fin affichée ne vaut que
 *   le jour du relevé (aucune date de fin inventée) ; une condition non calculable n'est jamais appliquée ;
 * - contenance obligatoire, sauf article vendu au poids ou à la pièce (prix au kilo ou à la pièce) ;
 * - aucune date future ; les lignes « EXEMPLE » (modèle) sont ignorées ;
 * - **publication** seulement si la ligne est validée (`statut` = valide, `valide_par`), que le besoin
 *   est l'un des 50 du noyau, que la variante n'est pas exclue par les règles revues et que chaque
 *   fichier de preuve cité est présent. Le lot publié ne contient ni nom de fichier, ni preuve, ni
 *   auteur, ni validateur : ces informations restent dans le rapport privé (`lines`).
 */

export const RELEVES_CONNECTOR_ID = 'releves';

/** Colonnes du modèle `data/releves/modele.csv`, dans l'ordre. */
export const RELEVE_COLUMNS = [
  'enseigne',
  'magasin',
  'date',
  'besoin',
  'article',
  'variante',
  'marque',
  'code_barres',
  'contenance',
  'unite',
  'au_poids',
  'prix_chf',
  'prix_action_chf',
  'action_du',
  'action_au',
  'carte',
  'conditions',
  'bio',
  'suisse',
  'preuve',
  'releve_par',
  'statut',
  'valide_par',
] as const;

/** Colonnes indispensables d'un fichier (les autres peuvent manquer : cases vides). */
const REQUIRED_COLUMNS = ['enseigne', 'magasin', 'date', 'besoin', 'article', 'unite', 'prix_chf', 'preuve'];

/** Extensions admises pour une preuve (photo de l'étiquette ou du ticket, ou PDF). */
export const PROOF_EXTENSIONS = /\.(jpe?g|png|heic|webp|pdf)$/i;

export interface ReleveOptions {
  now: Date;
  /** Succursales connues (instantané OSM) : le magasin d'un relevé doit y figurer. */
  stores: Store[];
  catalog?: CanonicalProduct[];
  chains?: Chain[];
  /** Besoins publiables (par défaut les 50 du noyau, `P1_ESSENTIALS`). */
  publishableNeeds?: readonly string[];
  /** Noms des fichiers présents dans le dossier privé des preuves ; absent : aucune preuve vérifiable. */
  proofFiles?: ReadonlySet<string>;
  /** Variantes incompatibles par besoin, tirées des règles revues (`offerRules`). */
  incompatible?: ReadonlyMap<string, VariantRule[]>;
}

/** Résultat d'une ligne, pour le rapport privé de validation (jamais publié). */
export type ReleveLineStatus = 'publie' | 'en_attente' | 'refuse' | 'invalide' | 'exemple';
export interface ReleveLine {
  file: string;
  line: number;
  status: ReleveLineStatus;
  reasons: string[];
  chainId: string | null;
  storeId: string | null;
  date: string | null;
  need: string | null;
  article: string | null;
  /** Preuve citée (nom de fichier) : donnée privée. */
  proof: string | null;
}

/** Exigences de variante d'un besoin, reprises d'une règle revue (exclusions, mentions requises, bio). */
export interface VariantRule {
  ruleId: string;
  words: string[];
  require: string[];
  organic: boolean | undefined;
}

const STATUTS: Record<string, 'a_valider' | 'valide' | 'refuse'> = {
  '': 'a_valider',
  a_valider: 'a_valider',
  'à valider': 'a_valider',
  'a valider': 'a_valider',
  valide: 'valide',
  validé: 'valide',
  refuse: 'refuse',
  refusé: 'refuse',
};

const plain = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[’`]/g, "'").toLowerCase();

/**
 * Condition d'une action relevée : « dès 2 » (ou « à partir de 2 ») devient un prix dès N paquets ;
 * toute autre condition reste affichée mais n'est jamais appliquée au panier.
 */
function conditionType(conditions: string | null): Pick<Promotion, 'type' | 'minQty'> {
  if (!conditions) return { type: 'price' };
  const m = /^(?:des|a partir de)\s+(\d+)\b/.exec(plain(conditions).trim());
  if (m && Number(m[1]) >= 2) return { type: 'min_qty_price', minQty: Number(m[1]) };
  return { type: 'conditional' };
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

/**
 * Lit un ou plusieurs fichiers de relevés et construit le lot **publiable** (lignes validées
 * seulement, sans donnée privée) ; chaque ligne lue figure dans `lines` (rapport privé) avec son
 * statut : publiée, en attente de validation ou de preuve, refusée, invalide (motif) ou exemple.
 */
export function buildRelevesBatch(files: Array<{ name: string; content: string }>, opts: ReleveOptions): ConnectorBatch & { lines: ReleveLine[] } {
  const report = emptyReport();
  const chains = opts.chains ?? CHAINS;
  const bySlug = new Map((opts.catalog ?? PRODUCTS).map((c) => [c.slug, c]));
  const publishable = new Set(opts.publishableNeeds ?? P1_ESSENTIALS);
  const storesById = new Map(opts.stores.map((s) => [s.id, s]));
  const today = opts.now.toISOString().slice(0, 10);
  const products = new Map<string, RetailerProduct>();
  const prices = new Map<string, PriceObservation>();
  const promotions = new Map<string, Promotion>();
  const lines: ReleveLine[] = [];
  let ignoredExamples = 0;

  for (const file of files) {
    const { headers, rows } = parseCsv(file.content);
    const missing = REQUIRED_COLUMNS.filter((c) => !headers.includes(c));
    if (missing.length) {
      report.rejected.push({ file: file.name, message: `Colonnes manquantes : ${missing.join(', ')} (voir data/releves/modele.csv)` });
      continue;
    }
    for (const { line, values: row } of rows) {
      const entry: ReleveLine = {
        file: file.name,
        line,
        status: 'invalide',
        reasons: [],
        chainId: text(row, 'enseigne')?.toLowerCase() ?? null,
        storeId: text(row, 'magasin'),
        date: text(row, 'date'),
        need: text(row, 'besoin'),
        article: text(row, 'article'),
        proof: text(row, 'preuve'),
      };
      lines.push(entry);
      try {
        if (isExampleSource(text(row, 'preuve')) || isExampleSource(text(row, 'releve_par'))) {
          ignoredExamples++;
          entry.status = 'exemple';
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
        const variant = text(row, 'variante');
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
        const conditions = text(row, 'conditions');
        if ((actionFrom || actionTo || loyalty || conditions) && promo === null) throw new RowError('prix_action_chf', 'Dates d’action, carte ou conditions sans prix d’action');
        const barcode = text(row, 'code_barres')?.replace(/\s/g, '') ?? null;
        if (barcode && !isValidGtin(barcode)) throw new RowError('code_barres', `Code-barres invalide (clé de contrôle) : ${barcode}`);
        const statut = STATUTS[(text(row, 'statut') ?? '').toLowerCase()];
        if (!statut) throw new RowError('statut', `Statut attendu : a_valider, valide ou refuse (${text(row, 'statut')})`);

        const fullName = variant ? `${name} ${variant}` : name;
        const key = [slug, fullName.toLowerCase(), (brand ?? '').toLowerCase(), barcode ?? '', quantity.amount, quantity.unit, loose, organic, swiss].join('|');
        const sku = `rel-${hash32(key).toString(36)}`;
        const id = `${chain.id}:${sku}`;
        const labels = [...labelsFromName(fullName), ...(loose && quantity.unit === 'g' ? [VARIABLE_WEIGHT_LABEL] : [])];
        const product: RetailerProduct = {
          id,
          chainId: chain.id,
          connectorId: RELEVES_CONNECTOR_ID,
          sku,
          gtin: barcode,
          name: loose ? `${fullName}, ${quantity.unit === 'g' ? 'au kilo' : 'à la pièce'}` : fullName,
          brand,
          quantity,
          attributes: { organic, swissOrigin: swiss, labels },
          url: null,
          isDemo: false,
          declaredSlug: slug,
        };
        // Exigences du besoin (origine suisse, bio, AOP, sans lactose) : refus explicite plutôt qu'un prix ignoré.
        if (!meetsRequirements(canonical, product)) throw new RowError('besoin', `L'article ne remplit pas les exigences du besoin ${slug} (${requirementText(canonical)})`);

        // Publication : validation, besoin du noyau, variante compatible, preuve présente.
        const blocking: string[] = [];
        const pending: string[] = [];
        if (statut === 'refuse') blocking.push('refusé à la validation');
        if (!publishable.has(slug)) blocking.push(`besoin ${slug} hors des 50 du noyau : non publié`);
        const words = plain(`${fullName} ${brand ?? ''}`);
        for (const r of opts.incompatible?.get(slug) ?? []) {
          const hit = r.words.find((w) => new RegExp(`\\b${plain(w)}`).test(words));
          const absentWord = r.require.find((w) => !new RegExp(`\\b${plain(w)}`).test(words));
          if (hit) blocking.push(`variante incompatible avec le besoin (« ${hit.trim()} », règle revue ${r.ruleId})`);
          else if (absentWord) blocking.push(`mention « ${absentWord} » absente de la désignation (règle revue ${r.ruleId})`);
          else if (r.organic === false && organic) blocking.push(`article bio : variante différente du besoin (règle revue ${r.ruleId})`);
        }
        if (statut === 'a_valider') pending.push('en attente de validation (statut « valide » et valide_par)');
        if (statut === 'valide' && !text(row, 'valide_par')) pending.push('valide_par manquant');
        const proofNames = proof.split(/[,;]\s*|\s+\+\s+/).map((x) => x.trim()).filter(Boolean);
        const badName = proofNames.filter((f) => !PROOF_EXTENSIONS.test(f));
        const absent = proofNames.filter((f) => PROOF_EXTENSIONS.test(f) && !opts.proofFiles?.has(f));
        if (badName.length) pending.push(`preuve à fournir en fichier (photo ou PDF) : « ${badName.join(', ')} »`);
        if (absent.length) pending.push(`fichier de preuve absent du dossier privé : ${absent.join(', ')}`);
        if (blocking.length || pending.length) {
          entry.status = blocking.length ? 'refuse' : 'en_attente';
          entry.reasons = [...blocking, ...pending];
          continue;
        }

        if (!products.has(id)) products.set(id, product);
        const observedAt = zurichLocalToInstant(date, '12:00').toISOString();
        // Référence publique : ni fichier, ni ligne, ni preuve, ni auteur (rapport privé seulement).
        const source = { connectorId: RELEVES_CONNECTOR_ID, kind: 'manual_survey' as const, ref: `relevé en magasin du ${date}` };
        const proofKind = /ticket|quittung|beleg|receipt|caisse/i.test(proof) ? 'receipt' : 'price_tag';
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
            proof: proofKind,
          });
        }
        if (promo !== null) {
          // Fin non affichée : l'action n'est retenue que pour le jour du relevé.
          const validFrom = actionFrom ?? date;
          const validTo = actionTo ?? date;
          if (validTo < validFrom) throw new RowError('action_au', 'Fin d’action antérieure au début');
          if (validTo < date) throw new RowError('action_au', 'Action déjà terminée le jour du relevé');
          const promoId = `${RELEVES_CONNECTOR_ID}:${store.id}:${sku}:${validFrom}:${loyalty ?? ''}`;
          const cond = conditionType(conditions);
          promotions.set(promoId, {
            id: promoId,
            retailerProductId: id,
            chainId: chain.id,
            zoneId: null,
            storeId: store.id,
            ...cond,
            promoPriceCents: Math.round(chfToCents(promo) * factor),
            referencePriceCents: regular !== null ? Math.round(chfToCents(regular) * factor) : null,
            loyaltyProgram: loyalty,
            whileStocksLast: false,
            endIsPresumed: false,
            label: [actionTo ? 'Action relevée en magasin' : 'Action relevée en magasin, fin non affichée : valable le jour du relevé', conditions ? `conditions : ${conditions.slice(0, 80)}` : null]
              .filter(Boolean)
              .join(' · '),
            publishedAt: observedAt,
            validFrom,
            validTo,
            source,
            verifiedAt: observedAt,
            isDemo: false,
          });
        }
        entry.status = 'publie';
      } catch (e) {
        const issue: ImportIssue = { file: file.name, line, message: e instanceof Error ? e.message : String(e) };
        if (e instanceof RowError) issue.field = e.field;
        report.rejected.push(issue);
        entry.status = 'invalide';
        entry.reasons = [issue.field ? `${issue.field} : ${issue.message}` : issue.message];
      }
    }
  }

  const retailerProducts = [...products.values()];
  const byChain: Record<string, number> = {};
  for (const o of prices.values()) {
    const chain = o.retailerProductId.split(':')[0] as string;
    byChain[chain] = (byChain[chain] ?? 0) + 1;
  }
  const count = (st: ReleveLineStatus) => lines.filter((l) => l.status === st).length;
  report.accepted = { products: retailerProducts.length, prices: prices.size, promotions: promotions.size, matches: retailerProducts.length };
  report.metrics = {
    files: files.length,
    stores: new Set([...prices.values()].map((o) => o.storeId)).size,
    needs: new Set(retailerProducts.map((p) => p.declaredSlug)).size,
    rejected: report.rejected.length,
    published: count('publie'),
    pending: count('en_attente'),
    refused: count('refuse'),
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
    lines,
  };
}

/**
 * Variantes incompatibles par besoin, tirées des règles revues des offres (mêmes exclusions pour
 * toutes les enseignes : « mini-bananes », « complètes », « bio »…).
 */
export function incompatibleVariants(
  rules: Array<{ id: string; canonicalSlug: string; exclude?: string[]; require?: string[]; organic?: boolean; alwaysReview?: string }>,
): Map<string, VariantRule[]> {
  const out = new Map<string, VariantRule[]>();
  for (const r of rules) {
    // Règle « toujours à vérifier » (information jamais publiée par l'enseigne) : sans objet pour un relevé.
    if (r.alwaysReview) continue;
    out.set(r.canonicalSlug, [...(out.get(r.canonicalSlug) ?? []), { ruleId: r.id, words: r.exclude ?? [], require: r.require ?? [], organic: r.organic }]);
  }
  return out;
}

/**
 * Données privées d'un fichier de relevés retrouvées dans un lot à publier : nom du fichier, preuves
 * citées, auteur et validateur (valeurs d'au moins 3 caractères, mot entier). Vide si le lot est publiable.
 */
export function privateLeaks(batch: Pick<ConnectorBatch, 'retailerProducts' | 'prices' | 'promotions'>, files: Array<{ name: string; content: string }>): string[] {
  const json = JSON.stringify(batch);
  const secrets = new Set<string>();
  for (const f of files) {
    secrets.add(f.name);
    for (const { values } of parseCsv(f.content).rows) {
      for (const field of ['preuve', 'releve_par', 'valide_par']) {
        const v = text(values, field);
        if (!v) continue;
        secrets.add(v);
        if (field === 'preuve') for (const part of v.split(/[,;]\s*|\s+\+\s+/)) if (part.trim()) secrets.add(part.trim());
      }
    }
  }
  const esc = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return [...secrets].filter((v) => v.length >= 3 && new RegExp(`(^|[^\\p{L}\\p{N}])${esc(v)}($|[^\\p{L}\\p{N}])`, 'u').test(json));
}
