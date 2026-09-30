import type {
  CanonicalProduct,
  CandidateStore,
  Category,
  Chain,
  LatLon,
  Locality,
  OfferIndex,
} from '@cabas/core';

export interface LocalityHit extends Locality {
  label: string;
}

export interface ChainStatus {
  chainId: string;
  stores: number;
  products: number;
  demoProducts: number;
  realPrices: number;
  /** Prix publiés par l'enseigne elle-même (site officiel, API publique du site, flux sous accord). */
  officialPrices: number;
  lastObservation: string | null;
  lastOfficialObservation: string | null;
  activePromotions: number;
  upcomingPromotions: number;
}

/** Prix réels uniquement (« live ») ou données fictives uniquement (« demo ») : jamais de mélange. */
export type PriceMode = 'live' | 'demo';

/** État de la dernière collecte d'une source de prix réels. */
export interface CollectionInfo {
  connectorId: string;
  label: string;
  collectedAt: string | null;
  status: string;
  message: string | null;
  products: number;
  prices: number;
  promotions: number;
  license: string | null;
  attribution: string | null;
}

/** Accès aux données en lecture pour l'application publique. */
export interface AppData {
  readonly mode: 'postgres' | 'memory';
  chains(): Promise<Chain[]>;
  categories(): Promise<Category[]>;
  products(): Promise<CanonicalProduct[]>;
  searchLocalities(query: string, limit: number): Promise<LocalityHit[]>;
  storesNear(center: LatLon, radiusKm: number, chainIds?: string[] | null): Promise<CandidateStore[]>;
  offers(canonicalIds: string[], chainIds: string[], now: Date): Promise<OfferIndex>;
  chainStatus(now: Date): Promise<ChainStatus[]>;
  /** Vrai si au moins un prix réel (non démo) est disponible. */
  hasRealPrices(now: Date): Promise<boolean>;
  /** Mode de données servi (PRICE_DATA=live|demo, sinon « live » dès qu'un prix réel existe). */
  priceMode(now: Date): Promise<PriceMode>;
  /** Dernières collectes des sources réelles. */
  collections(): Promise<CollectionInfo[]>;
}
