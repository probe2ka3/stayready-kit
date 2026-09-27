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
  lastObservation: string | null;
  activePromotions: number;
  upcomingPromotions: number;
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
}
