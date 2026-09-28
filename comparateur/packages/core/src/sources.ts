import type { DataSource, FreshnessPolicy, MatchKind, PriceObservation, SourceReliability } from './types';
import { ageInDays } from './time';

/**
 * Hiérarchie des sources de prix (docs/DATA_ENGINE.md) :
 *
 *   1. first_party : l'enseigne elle-même (site officiel, API publique du site, flux sous accord) ;
 *   2. licensed    : fournisseur de données tiers sous licence (agrégateur) ;
 *   3. community   : relevés communautaires ou tickets de caisse (Open Prices, utilisateurs) ;
 *   4. unknown     : provenance non qualifiée (jamais utilisée sans avertissement).
 *
 * Une observation garde toujours sa provenance : le niveau sert à choisir le prix affiché,
 * jamais à fusionner deux sources.
 */
export type SourceTier = 'first_party' | 'licensed' | 'community' | 'unknown';

export const TIER_RANK: Record<SourceTier, number> = { first_party: 0, licensed: 1, community: 2, unknown: 3 };

export const TIER_LABEL: Record<SourceTier, string> = {
  first_party: 'Enseigne (officiel)',
  licensed: 'Fournisseur de données tiers',
  community: 'Relevé communautaire',
  unknown: 'Source non qualifiée',
};

export type CollectionMethod =
  | 'public_web_page' // page publique officielle
  | 'public_api' // API publique consommée par le site officiel
  | 'official_feed' // flux fourni par l'enseigne (accord)
  | 'licensed_api' // API d'un fournisseur tiers
  | 'community_receipt' // ticket de caisse communautaire
  | 'community_price_tag' // photo d'étiquette communautaire
  | 'receipt_scan' // ticket transmis dans TesPrix (anonymisé)
  | 'manual_survey' // relevé documenté par l'exploitant
  | 'file_import'
  | 'demo';

export interface SourceInfo {
  connectorId: string;
  provider: string;
  tier: SourceTier;
  collectionMethod: CollectionMethod;
  license: string | null;
  attribution: string | null;
  /** Source de comparaison uniquement : jamais utilisée pour un prix affiché sans activation explicite. */
  benchmarkOnly?: boolean;
}

/** Sources connues. Un connecteur absent est qualifié d'après le type de source. */
export const SOURCE_REGISTRY: Record<string, SourceInfo> = {
  'lidl-web': {
    connectorId: 'lidl-web',
    provider: 'Lidl Suisse (site officiel)',
    tier: 'first_party',
    collectionMethod: 'public_web_page',
    license: null,
    attribution: null,
  },
  'aldi-api': {
    connectorId: 'aldi-api',
    provider: 'Aldi Suisse (API publique du site officiel)',
    tier: 'first_party',
    collectionMethod: 'public_api',
    license: null,
    attribution: null,
  },
  'open-prices': {
    connectorId: 'open-prices',
    provider: 'Open Prices (Open Food Facts)',
    tier: 'community',
    collectionMethod: 'community_receipt',
    license: 'ODbL-1.0',
    attribution: 'Open Prices (Open Food Facts), licence ODbL',
  },
  foodally: {
    connectorId: 'foodally',
    provider: 'FoodAlly',
    tier: 'licensed',
    collectionMethod: 'licensed_api',
    license: 'FoodAlly — accès public par requête, attribution obligatoire',
    attribution: 'Source : FoodAlly (foodally.ch)',
    benchmarkOnly: true,
  },
  receipts: {
    connectorId: 'receipts',
    provider: 'Tickets de caisse TesPrix (anonymisés)',
    tier: 'community',
    collectionMethod: 'receipt_scan',
    license: null,
    attribution: null,
  },
};

export function sourceInfo(source: Pick<DataSource, 'connectorId' | 'kind'>): SourceInfo {
  const known = SOURCE_REGISTRY[source.connectorId];
  if (known) return known;
  const base = { connectorId: source.connectorId, provider: source.connectorId, license: null, attribution: null };
  switch (source.kind) {
    case 'retailer_site':
      return { ...base, tier: 'first_party', collectionMethod: 'public_web_page' };
    case 'official_api':
    case 'agreement':
      return { ...base, tier: 'first_party', collectionMethod: 'official_feed' };
    case 'third_party':
      return { ...base, tier: 'licensed', collectionMethod: 'licensed_api' };
    case 'open_data':
      return { ...base, tier: 'community', collectionMethod: 'community_price_tag' };
    case 'receipt':
      return { ...base, tier: 'community', collectionMethod: 'receipt_scan' };
    case 'manual_survey':
      return { ...base, tier: 'community', collectionMethod: 'manual_survey' };
    case 'manual_import':
      return { ...base, tier: 'community', collectionMethod: 'file_import' };
    case 'demo':
      return { ...base, tier: 'unknown', collectionMethod: 'demo' };
    default:
      return { ...base, tier: 'unknown', collectionMethod: 'file_import' };
  }
}

export function tierOf(source: Pick<DataSource, 'connectorId' | 'kind'>): SourceTier {
  return sourceInfo(source).tier;
}

const TIER_CONFIDENCE: Record<SourceTier, number> = { first_party: 0.95, licensed: 0.8, community: 0.6, unknown: 0.3 };
const MATCH_CONFIDENCE: Record<MatchKind, number> = { gtin: 1, equivalent: 0.95, similar: 0.85 };

/**
 * Indice de confiance d'une observation (0 à 1), publié avec chaque prix :
 *
 *   confiance = base(niveau de source) × fraîcheur × correspondance
 *
 * - base : 0,95 officiel · 0,80 fournisseur tiers · 0,60 communautaire · 0,30 inconnu ;
 * - fraîcheur : 1 jusqu'à 1 jour, puis décroissance linéaire jusqu'à 0,5 à la limite de péremption,
 *   0,25 au-delà ;
 * - correspondance : 1 code-barres identique · 0,95 équivalent · 0,85 contenance voisine.
 */
export function confidenceOf(
  o: Pick<PriceObservation, 'observedAt' | 'source'> & { reliability?: SourceReliability },
  now: Date,
  policy: FreshnessPolicy,
  matchKind: MatchKind | null = null,
): number {
  const tier = tierOf(o.source);
  const limit = tier === 'community' ? policy.crowdStaleAfterDays : policy.staleAfterDays;
  const age = Math.max(0, ageInDays(o.observedAt, now));
  const freshness = age <= 1 ? 1 : age <= limit ? 1 - (0.5 * (age - 1)) / Math.max(1, limit - 1) : 0.25;
  const match = matchKind ? MATCH_CONFIDENCE[matchKind] : 1;
  return Math.round(TIER_CONFIDENCE[tier] * freshness * match * 100) / 100;
}
