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
  | 'open_data' // données ouvertes (OpenStreetMap, swisstopo)
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

export interface PriceObservation {
  id: string;
  retailerProductId: string;
  /** null = prix national de l'enseigne. */
  zoneId: string | null;
  /** Renseigné uniquement pour un prix propre à une succursale. */
  storeId: string | null;
  priceCents: number;
  /** Date de dernière vérification (instant ISO). */
  observedAt: string;
  source: DataSource;
  isDemo: boolean;
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
}

export const DEFAULT_FRESHNESS: FreshnessPolicy = {
  verifiedMaxAgeDays: 7,
  staleAfterDays: 30,
};
