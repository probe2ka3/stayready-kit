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

/**
 * Droit de réutilisation constaté (docs/DROITS_DONNEES.md) — une source techniquement accessible
 * n'est pas pour autant réutilisable publiquement :
 * - open_license : licence ouverte (ODbL, OGD), conditions de la licence à respecter ;
 * - own_data : données produites par TesPrix ou ses utilisateurs ;
 * - no_restriction_found : aucune clause restrictive trouvée ; avis juridique requis avant exploitation ;
 * - requires_authorization : conditions de l'enseigne restreignant l'usage (fins privées, usage
 *   commercial interdit) : **exclue de tout affichage en production** sans autorisation enregistrée
 *   (`AUTHORIZED_SOURCES`) ;
 * - licence_required : fournisseur tiers, affichage public seulement sous licence souscrite.
 */
export type PublicUse = 'open_license' | 'own_data' | 'no_restriction_found' | 'requires_authorization' | 'licence_required';

/**
 * Droit de **collecter** (distinct du droit de publier, `PublicUse`) :
 * - permitted : collecte automatisée compatible avec les conditions constatées ;
 * - private_use : conditions limitées à un usage privé ou interdisant seulement la publication et
 *   l'usage commercial : collecte pour l'évaluation privée de l'exploitant, données stockées hors
 *   dépôt (`data/private/`), jamais publiées ;
 * - not_permitted : accès refusé ou non accordé : aucune collecte.
 */
export type CollectionRight = 'permitted' | 'private_use' | 'not_permitted';

export interface SourceInfo {
  connectorId: string;
  provider: string;
  tier: SourceTier;
  collectionMethod: CollectionMethod;
  license: string | null;
  attribution: string | null;
  /** Source de comparaison uniquement : jamais utilisée pour un prix affiché sans activation explicite. */
  benchmarkOnly?: boolean;
  publicUse: PublicUse;
  /** Droit de collecter (défaut : `permitted` si la source est publiable, sinon `private_use`). */
  collection?: CollectionRight;
  /** Conditions constatées, en clair (référence : docs/DROITS_DONNEES.md). */
  termsNote: string;
  /** Enseignes couvertes par la source (sources officielles). */
  chainIds?: string[];
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
    chainIds: ['lidl'],
    publicUse: 'no_restriction_found',
    termsNote: 'Pages publiques ; robots.txt respecté ; mentions légales sans conditions d’utilisation du site (seules celles de Lidl Plus) ; LCD art. 5 let. c à faire valider.',
  },
  'aldi-api': {
    connectorId: 'aldi-api',
    provider: 'Aldi Suisse (API publique du site officiel)',
    tier: 'first_party',
    collectionMethod: 'public_api',
    license: null,
    attribution: null,
    chainIds: ['aldi'],
    publicUse: 'requires_authorization',
    collection: 'private_use',
    termsNote: 'Conditions d’utilisation d’Aldi Suisse : services « à des fins privées uniquement », usage des données à des fins commerciales interdit ; autorisation écrite ou avis juridique favorable requis.',
  },
  'denner-web': {
    connectorId: 'denner-web',
    provider: 'Denner (site officiel, recherche et actions)',
    tier: 'first_party',
    collectionMethod: 'public_web_page',
    license: null,
    attribution: null,
    chainIds: ['denner'],
    publicUse: 'requires_authorization',
    collection: 'private_use',
    termsNote:
      'Précisions d’ordre juridique de Denner : « La reproduction (complète ou partielle), la transmission […], la modification, la mise en réseau et l’utilisation du portail / de l’app dans un but de publication ou à des fins commerciales sont interdites sauf accord préalable écrit. » Prix indicatifs : « Seuls sont valides les prix affichés dans les points de vente. » Collecte privée seulement.',
  },
  'open-prices': {
    connectorId: 'open-prices',
    provider: 'Open Prices (Open Food Facts)',
    tier: 'community',
    collectionMethod: 'community_receipt',
    license: 'ODbL-1.0',
    attribution: 'Open Prices (Open Food Facts), licence ODbL',
    publicUse: 'open_license',
    termsNote: 'ODbL 1.0 : attribution et partage à l’identique des bases dérivées (export prévu).',
  },
  foodally: {
    connectorId: 'foodally',
    provider: 'FoodAlly',
    tier: 'licensed',
    collectionMethod: 'licensed_api',
    license: 'FoodAlly — accès public par requête, attribution obligatoire',
    attribution: 'Source : FoodAlly (foodally.ch)',
    benchmarkOnly: true,
    publicUse: 'licence_required',
    termsNote: 'Accès gratuit limité (usage « hobby ») ; collecte en masse interdite sans licence ; attribution avec lien ; usage dans une application : offre Pro ou Business.',
  },
  releves: {
    connectorId: 'releves',
    provider: 'Relevés en magasin (exploitant et bénévoles)',
    tier: 'community',
    collectionMethod: 'manual_survey',
    license: null,
    attribution: null,
    publicUse: 'own_data',
    termsNote:
      'Prix constatés soi-même en rayon ou sur un ticket, un magasin et un jour à la fois ; preuve conservée ; règlement du magasin respecté (pas de photo si elle est interdite : prix notés à la main).',
  },
  receipts: {
    connectorId: 'receipts',
    provider: 'Tickets de caisse TesPrix (anonymisés)',
    tier: 'community',
    collectionMethod: 'receipt_scan',
    license: null,
    attribution: null,
    publicUse: 'own_data',
    termsNote: 'Tickets transmis volontairement, données personnelles retirées sur l’appareil.',
  },
};

export function sourceInfo(source: Pick<DataSource, 'connectorId' | 'kind'>): SourceInfo {
  const known = SOURCE_REGISTRY[source.connectorId];
  if (known) return known;
  const base = {
    connectorId: source.connectorId,
    provider: source.connectorId,
    license: null,
    attribution: null,
    publicUse: (source.kind === 'agreement' ? 'own_data' : 'no_restriction_found') as PublicUse,
    termsNote: 'Source non répertoriée : conditions à vérifier.',
  };
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

/**
 * Sources à exclure de l'affichage : conditions restreignant l'usage (`requires_authorization`) sans
 * autorisation enregistrée. Appliqué en production ; en local, l'aperçu privé les conserve.
 */
export function restrictedConnectorIds(authorized: string[]): string[] {
  return Object.values(SOURCE_REGISTRY)
    .filter((s) => s.publicUse === 'requires_authorization' && !authorized.includes(s.connectorId))
    .map((s) => s.connectorId);
}

/** Source dont les données peuvent être publiées (versionnées, exportées, affichées publiquement). */
export function isPublishableSource(connectorId: string): boolean {
  const info = SOURCE_REGISTRY[connectorId];
  if (!info) return false;
  return info.publicUse === 'open_license' || info.publicUse === 'own_data' || info.publicUse === 'no_restriction_found';
}

/** Droit de collecte d'une source répertoriée ; une source inconnue n'est jamais collectée. */
export function collectionRight(connectorId: string): CollectionRight {
  const info = SOURCE_REGISTRY[connectorId];
  if (!info) return 'not_permitted';
  return info.collection ?? (isPublishableSource(connectorId) ? 'permitted' : 'private_use');
}

/**
 * Accès automatisé et gratuit par enseigne, constaté le 30.09.2026 (docs/COLLECTE_QUOTIDIENNE.md).
 * Sert au rapport quotidien et à l'administration : une enseigne sans source automatique n'est jamais
 * présentée comme couverte.
 */
export const CHAIN_ACCESS: Record<string, { automatic: 'public' | 'private' | 'none'; sources: string[]; note: string }> = {
  lidl: { automatic: 'public', sources: ['lidl-web', 'open-prices'], note: 'Site officiel (catégories, fiches, actions) ; aucune condition restrictive trouvée.' },
  aldi: { automatic: 'private', sources: ['aldi-api', 'open-prices'], note: 'API publique du site ; conditions : usage privé uniquement.' },
  denner: { automatic: 'private', sources: ['denner-web', 'open-prices'], note: 'Recherche et actions du site ; publication et usage commercial interdits sans accord écrit.' },
  migros: { automatic: 'none', sources: ['open-prices'], note: 'Site : 403 pour un robot identifié ; fiches sans prix dans le HTML ; API produits non ouverte (réponse officielle Migros) ; prospectus sur Issuu (extraction interdite par Issuu).' },
  coop: { automatic: 'none', sources: ['open-prices'], note: 'Site protégé par DataDome (403 dès robots.txt), aucun contournement ; journal numérique sans accès documenté, actions seulement.' },
};
