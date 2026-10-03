import { suggestMatches, type CanonicalProduct, type MatchKind, type ProductMatch, type RetailerProduct } from '@cabas/core';

/**
 * Correspondances revues par l'équipe données (fichier versionné `data/matching/reviewed.json`).
 * Une décision revue prime toujours sur les suggestions automatiques : validation
 * (`canonicalSlug` renseigné) ou refus explicite (`canonicalSlug: null`).
 */
export interface ReviewedMatch {
  retailerProductId: string;
  canonicalSlug: string | null;
  kind?: MatchKind;
  reviewer: string;
  reviewedAt: string;
  note?: string;
  /** Règle revue pour les offres hebdomadaires (chargée depuis `offerRules`, voir `OfferRule`). */
  offerRule?: OfferRule;
}

/**
 * Règle revue pour les **offres hebdomadaires** (articles `offer-…` : identifiant renouvelé chaque
 * semaine, donc impossible à revoir une fois pour toutes). Une offre n'est reliée au besoin que si
 * TOUS les critères sont remplis, sur les caractéristiques publiées avec l'offre :
 * - désignation (sans la marque en capitales ni « pack de N ») égale à l'une des `designations` ;
 * - marque parmi `brands` si la liste est donnée ;
 * - aucun mot de `exclude` (variante incompatible) ni « diverses sortes » dans la désignation et le
 *   descriptif (variante achetée inconnue) ;
 * - contenance dans `packs` (même unité que le besoin : jamais de pièces converties en grammes) ;
 * - bio seulement si `organic` le permet.
 * Sinon l'offre reste « à vérifier » (suggestion, jamais utilisée). Une offre reliée ne vaut que par
 * ses propres promotions (dates, conditions, région, source) : son prix « au lieu de » n'est pas
 * repris comme prix normal, et rien n'est prolongé d'une semaine à l'autre.
 */
export interface OfferRule {
  id: string;
  chainId: string;
  canonicalSlug: string;
  designations: string[];
  brands?: string[];
  exclude?: string[];
  packs: number[];
  /** false : article bio exclu ; true : bio exigé ; absent : indifférent. */
  organic?: boolean;
  /** Mots qui doivent figurer (désignation + descriptif), ex. « fraise » pour une confiture. */
  require?: string[];
  /** Désignation reconnue mais information décisive jamais publiée : toujours « à vérifier » (motif). */
  alwaysReview?: string;
  justification: string;
  reviewer: string;
  reviewedAt: string;
}

export interface ReviewedMatchesFile {
  description: string;
  matches: ReviewedMatch[];
  offerRules?: OfferRule[];
}

/** Article d'offre hebdomadaire (identifiant renouvelé chaque semaine). */
export const isWeeklyOffer = (p: Pick<RetailerProduct, 'sku'>) => p.sku.startsWith('offer-');

const strip = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[’`]/g, "'").toLowerCase();

/**
 * Désignation comparable d'une offre : sans la marque en capitales en tête (« QUALITÉ SUISSE »,
 * « VITA D’OR »), sans « pack de N » ni « XXL », minuscules sans accents.
 */
export function offerDesignation(name: string): string {
  let t = name.trim();
  // Mots entièrement en capitales en tête (marque ou ligne), au moins deux lettres chacun.
  t = t.replace(/^(?:[A-ZÀ-ÖØ-Þ0-9&'’.\-]{2,}\s+)+(?=[A-Za-zÀ-ÿ])/u, (m) => (/[a-zà-ÿ]/.test(m) ? m : ''));
  t = strip(t)
    .replace(/,?\s*(pack|lot) de \d+( xxl)?/g, '')
    .replace(/\bxxl\b/g, '')
    .replace(/\s+/g, ' ')
    .replace(/^[\s,.;:-]+|[\s,.;:-]+$/g, '');
  return t;
}

/** Variante non déterminée : l'article réellement acheté est inconnu. */
const UNKNOWN_VARIANT = /diverses sortes|differentes sortes|plusieurs sortes|assorti|au choix|divers parfums|diverses varietes/;

export type OfferRuleOutcome =
  | { status: 'linked'; rule: OfferRule; canonical: CanonicalProduct; kind: MatchKind }
  | { status: 'to_review'; rule: OfferRule | null; reason: string };

/**
 * Évalue les règles d'une enseigne pour une offre : reliée si exactement une règle est entièrement
 * satisfaite ; « à vérifier » (avec le motif) si une règle reconnaît la désignation mais qu'un
 * critère manque ; null si aucune règle ne concerne cette désignation.
 */
export function evaluateOfferRules(product: RetailerProduct, rules: OfferRule[], catalog: CanonicalProduct[]): OfferRuleOutcome | null {
  const designation = offerDesignation(product.name);
  const text = strip(`${product.name} ${product.details ?? ''}`);
  const candidates = rules.filter((r) => r.chainId === product.chainId && r.designations.some((d) => strip(d) === designation));
  if (candidates.length === 0) return null;
  const linked: Array<{ rule: OfferRule; canonical: CanonicalProduct; kind: MatchKind }> = [];
  let firstReason: { rule: OfferRule; reason: string } | null = null;
  const fail = (rule: OfferRule, reason: string) => {
    firstReason ??= { rule, reason };
  };
  for (const rule of candidates) {
    const canonical = catalog.find((c) => c.slug === rule.canonicalSlug);
    if (!canonical) {
      fail(rule, `besoin inconnu ${rule.canonicalSlug}`);
      continue;
    }
    if (rule.alwaysReview) {
      fail(rule, rule.alwaysReview);
      continue;
    }
    if (UNKNOWN_VARIANT.test(text)) {
      fail(rule, 'variante non précisée (« diverses sortes ») : article acheté inconnu');
      continue;
    }
    const excluded = (rule.exclude ?? []).find((w) => new RegExp(`\\b${strip(w)}`).test(text));
    if (excluded) {
      fail(rule, `variante exclue par la règle : « ${excluded} »`);
      continue;
    }
    const missingWord = (rule.require ?? []).find((w) => !new RegExp(`\\b${strip(w)}`).test(text));
    if (missingWord) {
      fail(rule, `mention « ${missingWord} » absente de la désignation et du descriptif`);
      continue;
    }
    if (rule.brands?.length && !rule.brands.some((b) => strip(b) === strip(product.brand ?? ''))) {
      fail(rule, `marque ${product.brand ?? 'inconnue'} non admise`);
      continue;
    }
    if (product.quantity.unit !== canonical.quantity.unit) {
      fail(rule, `unité ${product.quantity.unit} incompatible avec le besoin (${canonical.quantity.unit}) : aucune conversion sans poids documenté`);
      continue;
    }
    if (!rule.packs.includes(product.quantity.amount)) {
      fail(rule, `contenance ${product.quantity.amount} ${product.quantity.unit} non admise par la règle (${rule.packs.join(', ')})`);
      continue;
    }
    if (rule.organic === false && product.attributes.organic) {
      fail(rule, 'article bio : variante exclue par la règle');
      continue;
    }
    if (rule.organic === true && !product.attributes.organic) {
      fail(rule, 'bio exigé par la règle');
      continue;
    }
    const ratio = product.quantity.amount / canonical.quantity.amount;
    linked.push({ rule, canonical, kind: ratio >= 0.9 && ratio <= 1.1 ? 'equivalent' : 'similar' });
  }
  if (linked.length === 1) return { status: 'linked', ...(linked[0] as (typeof linked)[number]) };
  if (linked.length > 1) return { status: 'to_review', rule: null, reason: `plusieurs règles applicables (${linked.map((l) => l.rule.id).join(', ')})` };
  const r = firstReason as { rule: OfferRule; reason: string } | null;
  return { status: 'to_review', rule: r?.rule ?? null, reason: r?.reason ?? 'aucune règle satisfaite' };
}

function kindFor(product: RetailerProduct, canonical: CanonicalProduct): MatchKind {
  if (product.gtin && canonical.gtins?.includes(product.gtin)) return 'gtin';
  const ratio = product.quantity.amount / canonical.quantity.amount;
  return ratio >= 0.9 && ratio <= 1.1 ? 'equivalent' : 'similar';
}

/**
 * Correspondances d'un lot : décisions revues (validées), sinon suggestions
 * (« suggested », non utilisées par le comparateur avant validation), sauf GTIN identique.
 */
export function matchesFor(
  products: RetailerProduct[],
  catalog: CanonicalProduct[],
  reviewed: ReviewedMatch[] = [],
): { matches: ProductMatch[]; reviewedCount: number } {
  const bySlug = new Map(catalog.map((c) => [c.slug, c]));
  const decisions = new Map<string, ReviewedMatch[]>();
  const offerRules = reviewed.flatMap((r) => (r.offerRule ? [r.offerRule] : []));
  for (const r of reviewed) {
    if (r.offerRule) continue;
    const list = decisions.get(r.retailerProductId) ?? [];
    list.push(r);
    decisions.set(r.retailerProductId, list);
  }
  const matches: ProductMatch[] = [];
  let reviewedCount = 0;
  for (const p of products) {
    const own = decisions.get(p.id);
    if (own) {
      reviewedCount++;
      for (const d of own) {
        const c = d.canonicalSlug ? bySlug.get(d.canonicalSlug) : undefined;
        if (!c || c.quantity.unit !== p.quantity.unit) continue;
        // Offre hebdomadaire revue par identifiant : elle aussi ne vaut que par ses propres promotions
        // (son prix « au lieu de » n'est jamais prolongé au-delà de l'action).
        matches.push({
          canonicalId: c.id,
          retailerProductId: p.id,
          kind: d.kind ?? kindFor(p, c),
          status: 'validated',
          confidence: 1,
          ...(isWeeklyOffer(p) ? { promotionsOnly: true } : {}),
        });
      }
      continue;
    }
    // Offre hebdomadaire : règle revue entièrement satisfaite, sinon « à vérifier » (jamais utilisée).
    if (offerRules.length && isWeeklyOffer(p)) {
      const outcome = evaluateOfferRules(p, offerRules, catalog);
      if (outcome?.status === 'linked') {
        if (outcome.canonical.quantity.unit === p.quantity.unit) {
          matches.push({ canonicalId: outcome.canonical.id, retailerProductId: p.id, kind: outcome.kind, status: 'validated', confidence: 1, ruleId: outcome.rule.id, promotionsOnly: true });
        }
        continue;
      }
      if (outcome?.status === 'to_review') {
        const c = outcome.rule ? bySlug.get(outcome.rule.canonicalSlug) : undefined;
        if (c) matches.push({ canonicalId: c.id, retailerProductId: p.id, kind: kindFor(p, c), status: 'suggested', confidence: 0.5, ruleId: outcome.rule?.id ?? null });
        continue;
      }
    }
    // Besoin déclaré par la source (relevé, catégorie) : pris tel quel, jamais complété par une suggestion.
    if (p.declaredSlug) {
      const c = bySlug.get(p.declaredSlug);
      if (c && c.quantity.unit === p.quantity.unit) {
        matches.push({ canonicalId: c.id, retailerProductId: p.id, kind: kindFor(p, c), status: 'validated', confidence: 1 });
      }
      continue;
    }
    for (const s of suggestMatches(p, catalog)) {
      matches.push({
        canonicalId: s.canonicalId,
        retailerProductId: p.id,
        kind: s.kind,
        status: s.autoValidate ? 'validated' : 'suggested',
        confidence: s.confidence,
      });
    }
  }
  return { matches, reviewedCount };
}
