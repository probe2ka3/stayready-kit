/**
 * Types du domaine. Aucun type ici ne dépend d'une base de données ou d'un framework :
 * les adaptateurs (Postgres, mémoire, connecteurs) produisent ces structures.
 *
 * Conventions :
 * - Les montants sont en centimes (entiers) pour éviter les erreurs d'arrondi.
 * - Les dates calendaires (validité des promotions) sont des chaînes `YYYY-MM-DD`
 *   interprétées dans le fuseau Europe/Zurich, bornes incluses.
 * - Les instants (date de publication, de vérification) sont des chaînes ISO 8601 UTC.
 */

export type ChainId = string;

/** Unités normalisées : grammes, millilitres ou pièces. */
export type Unit = 'g' | 'ml' | 'piece';

export interface Quantity {
  amount: number;
  unit: Unit;
}

export interface LatLon {
  lat: number;
  lon: number;
}

/** Origine d'une donnée, par ordre de priorité décroissante (voir docs/audit). */
export type SourceKind =
  | 'official_api' // API ou flux officiel autorisé
  | 'agreement' // accès fourni dans le cadre d'un accord avec l'enseigne
  | 'manual_survey' // relevé manuel (magasin ou page publique) par une personne
  | 'manual_import' // import structuré (CSV/JSON) d'une source documentée
  | 'retailer_site' // pages publiques officielles de l'enseigne, collecte automatisée conforme (robots.txt)
  | 'open_data' // données ouvertes (OpenStreetMap, swisstopo, Open Prices)
  | 'third_party' // fournisseur de données tiers (agrégateur, licence) : jamais confondu avec l'enseigne
  | 'receipt' // ticket de caisse transmis par un utilisateur (anonymisé)
  | 'demo'; // données fictives de démonstration

export interface DataSource {
  connectorId: string;
  kind: SourceKind;
  /** URL, nom de fichier ou référence du relevé. */
  ref?: string | null;
}

export interface PromoWave {
  /** Jour ISO de début : 1 = lundi … 7 = dimanche. */
  startWeekday: number;
  /** Durée en jours (inclusif), null = « jusqu'à épuisement du stock » sans fin connue. */
  durationDays: number | null;
  /** Nombre de jours entre la publication et le début. */
  publishLeadDays: number;
  label: string;
}

export interface Chain {
  id: ChainId;
  name: string;
  /** Initiales affichées dans une pastille neutre (aucun logo n'est utilisé). */
  badge: string;
  website: string;
  status: 'active' | 'planned' | 'disabled';
  /** Calendrier habituel constaté lors de l'audit (documentaire + génération démo). */
  promoCalendar: {
    waves: PromoWave[];
    verifiedAt: string;
    sourceUrl: string;
    notes?: string;
  };
  loyaltyPrograms: { id: string; name: string }[];
  /** Restriction d'audience : Aligro → uniquement prix TTC accessibles aux particuliers. */
  consumerPricesOnly?: boolean;
  notes?: string;
}

export interface PriceZone {
  id: string;
  chainId: ChainId;
  name: string;
  cantons: string[];
  /**
   * Langues de la localité (swisstopo : de, fr, it, rm) : prioritaires sur le canton
   * lorsqu'elles sont connues (ex. actions Lidl « Suisse romande » dans un canton bilingue).
   */
  languages?: string[];
}

/** Localité suisse (répertoire officiel des localités, swisstopo). */
export interface Locality {
  zip: string;
  /** Chiffre complémentaire du NPA (plusieurs localités peuvent partager un NPA). */
  suffix: string;
  name: string;
  municipality: string;
  canton: string;
  lat: number;
  lon: number;
  lang: string;
}

export interface Store {
  id: string;
  chainId: ChainId;
  name: string;
  format?: string | null;
  street?: string | null;
  zip?: string | null;
  city?: string | null;
  canton?: string | null;
  lat: number;
  lon: number;
  /** Horaires au format OpenStreetMap `opening_hours`. */
  openingHours?: string | null;
  accessNotes?: string | null;
  zoneId?: string | null;
  source: DataSource;
  verifiedAt?: string | null;
}

export type CategoryKind = 'food' | 'household' | 'hygiene' | 'other';

export interface Category {
  id: string;
  name: string;
  kind: CategoryKind;
  icon: string;
  sort: number;
}

export interface ProductAttributes {
  organic?: boolean;
  swissOrigin?: boolean;
  /** Labels et régimes : 'vegan', 'lactose-free', 'gluten-free', 'fairtrade', 'aop', 'ip-suisse'… */
  labels?: string[];
}

/** Référence normalisée (produit standard) indépendante des enseignes. */
export interface CanonicalProduct {
  id: string;
  slug: string;
  name: string;
  categoryId: string;
  quantity: Quantity;
  attributes: ProductAttributes;
  /** Marque imposée : seuls les produits de cette marque sont équivalents. */
  brandRequired?: string | null;
  gtins?: string[];
  keywords?: string[];
}

/** Article vendu par une enseigne. */
export interface RetailerProduct {
  id: string;
  chainId: ChainId;
  connectorId: string;
  sku: string;
  gtin?: string | null;
  name: string;
  brand?: string | null;
  quantity: Quantity;
  attributes: ProductAttributes;
  url?: string | null;
  isDemo: boolean;
}

/**
 * gtin       : même code EAN/GTIN → produit identique.
 * equivalent : produit différent mais équivalent (type, quantité ±10 %, caractéristiques).
 * similar    : même type et caractéristiques, conditionnement différent (comparé au prix unitaire).
 */
export type MatchKind = 'gtin' | 'equivalent' | 'similar';
export type MatchStatus = 'validated' | 'suggested' | 'rejected';

export interface ProductMatch {
  canonicalId: string;
  retailerProductId: string;
  kind: MatchKind;
  status: MatchStatus;
  confidence: number;
}

/** Type de prix relevé. */
export type PriceType =
  | 'regular' // prix de vente habituel
  | 'promo'; // prix affiché pendant une action (sans dates connues)

/** Canal de vente auquel le prix s'applique. */
export type SalesChannel = 'store' | 'online';

/**
 * Fiabilité de la source :
 * - official : publié par l'enseigne (site officiel, flux, accord) ;
 * - survey   : relevé documenté par l'exploitant (import structuré) ;
 * - crowd    : relevé communautaire avec justificatif (Open Prices, tickets) — toujours « indicatif » ;
 * - third_party : fournisseur de données tiers (agrégateur) — toujours « indicatif ».
 */
export type SourceReliability = 'official' | 'survey' | 'crowd' | 'third_party';

export interface PriceObservation {
  id: string;
  retailerProductId: string;
  /** null = prix national de l'enseigne. */
  zoneId: string | null;
  /** Renseigné uniquement pour un prix propre à une succursale. */
  storeId: string | null;
  priceCents: number;
  /** Instant du relevé (collecte ou photo du justificatif), ISO UTC. */
  observedAt: string;
  source: DataSource;
  isDemo: boolean;
  /** Défaut : 'regular'. */
  priceType?: PriceType;
  /** Défaut : 'store'. */
  channel?: SalesChannel;
  /** Défaut : déduite du type de source ('official' pour retailer_site / official_api / agreement). */
  reliability?: SourceReliability;
  /** Licence des données (ex. 'ODbL-1.0') ; null = données propres ou sous accord. */
  license?: string | null;
  /** Page ou ressource où le prix a été lu. */
  sourceUrl?: string | null;
  /** Lieu réel du relevé lorsqu'il est généralisé à une zone ou au niveau national. */
  observedAtPlace?: string | null;
  /** Justificatif : ticket, étiquette, page web, réponse d'une API publique de l'enseigne. */
  proof?: 'receipt' | 'price_tag' | 'web_page' | 'public_api' | null;
}

export type PromotionType =
  | 'price' // prix promotionnel unitaire
  | 'percent' // rabais en %
  | 'multibuy' // X pour le prix de Y (ex. 3 pour 2)
  | 'min_qty_price' // prix unitaire dès N pièces
  | 'min_qty_percent'; // rabais en % dès N pièces

export interface Promotion {
  id: string;
  retailerProductId: string;
  chainId: ChainId;
  zoneId: string | null;
  storeId: string | null;
  type: PromotionType;
  promoPriceCents?: number | null;
  percent?: number | null;
  buyQty?: number | null;
  payQty?: number | null;
  minQty?: number | null;
  /** Prix « au lieu de » communiqué par l'enseigne (OIP art. 16) ; jamais calculé par nous. */
  referencePriceCents?: number | null;
  /** Programme requis (carte / application) : 'cumulus', 'supercard', 'lidl-plus'… */
  loyaltyProgram?: string | null;
  whileStocksLast: boolean;
  /** Vrai si la date de fin n'est pas publiée par l'enseigne (ex. « solange Vorrat »). */
  endIsPresumed?: boolean;
  label?: string | null;
  /** Restriction géographique annoncée par l'enseigne (texte d'origine, ex. « uniquement au Tessin »). */
  regionNote?: string | null;
  /** Page où l'action est publiée. */
  sourceUrl?: string | null;
  /** Instant de publication par l'enseigne (≠ date de début). */
  publishedAt: string;
  /** Premier jour de validité (Europe/Zurich, inclus). */
  validFrom: string;
  /** Dernier jour de validité (Europe/Zurich, inclus). */
  validTo: string;
  source: DataSource;
  verifiedAt: string;
  isDemo: boolean;
}

/** Statut de fiabilité affiché à côté de chaque prix. */
export type PriceStatus =
  | 'verified' // prix vérifié récemment
  | 'promo_confirmed' // promotion publiée par la source et valable à la date
  | 'indicative' // prix non garanti (ancien, ou dernier prix connu pour une date future)
  | 'stale' // prix périmé
  | 'demo'; // donnée fictive de démonstration

export interface FreshnessPolicy {
  /** Un prix vérifié il y a moins de N jours est « vérifié ». */
  verifiedMaxAgeDays: number;
  /** Au-delà de N jours, un prix est « périmé ». Entre les deux : « indicatif ». */
  staleAfterDays: number;
  /**
   * Relevés communautaires (jamais « vérifiés ») : périmés au-delà de N jours. Plus long que
   * `staleAfterDays` car ces relevés sont rares ; leur date est toujours affichée.
   */
  crowdStaleAfterDays: number;
}

export const DEFAULT_FRESHNESS: FreshnessPolicy = {
  verifiedMaxAgeDays: 7,
  staleAfterDays: 30,
  crowdStaleAfterDays: 90,
};
