import {
  buildOfferIndex,
  DEFAULT_FRESHNESS,
  DEFAULT_PREFS,
  type CanonicalProduct,
  type PriceObservation,
  type PriceProfile,
  type PricingContext,
  type ProductMatch,
  type Promotion,
  type RetailerProduct,
} from '../src';

export const NOW = new Date('2026-09-27T10:00:00Z'); // dimanche 27.09.2026, 12:00 à Zurich
export const TODAY = '2026-09-27';

export function canonical(id: string, amount: number, unit: 'g' | 'ml' | 'piece' = 'g', extra: Partial<CanonicalProduct> = {}): CanonicalProduct {
  return {
    id,
    slug: id,
    name: id,
    categoryId: 'test',
    quantity: { amount, unit },
    attributes: {},
    ...extra,
  };
}

export function product(
  id: string,
  chainId: string,
  amount: number,
  unit: 'g' | 'ml' | 'piece' = 'g',
  extra: Partial<RetailerProduct> = {},
): RetailerProduct {
  return {
    id,
    chainId,
    connectorId: 'test',
    sku: id,
    name: id,
    quantity: { amount, unit },
    attributes: {},
    isDemo: false,
    ...extra,
  };
}

let seq = 0;
export function price(
  productId: string,
  cents: number,
  observedAt = '2026-09-26T08:00:00Z',
  extra: Partial<PriceObservation> = {},
): PriceObservation {
  return {
    id: `o${++seq}`,
    retailerProductId: productId,
    zoneId: null,
    storeId: null,
    priceCents: cents,
    observedAt,
    source: { connectorId: 'test', kind: 'manual_survey', ref: 'test' },
    isDemo: false,
    ...extra,
  };
}

export function promo(productId: string, chainId: string, extra: Partial<Promotion>): Promotion {
  return {
    id: `p${++seq}`,
    retailerProductId: productId,
    chainId,
    zoneId: null,
    storeId: null,
    type: 'price',
    whileStocksLast: false,
    publishedAt: '2026-09-23T06:00:00Z',
    validFrom: '2026-09-24',
    validTo: '2026-09-30',
    source: { connectorId: 'test', kind: 'manual_survey', ref: 'flyer' },
    verifiedAt: '2026-09-24T06:00:00Z',
    isDemo: false,
    ...extra,
  };
}

export function match(canonicalId: string, retailerProductId: string, kind: ProductMatch['kind'] = 'equivalent'): ProductMatch {
  return { canonicalId, retailerProductId, kind, status: 'validated', confidence: 1 };
}

export function ctx(overrides: Partial<PricingContext> = {}): PricingContext {
  return {
    asOf: NOW,
    today: TODAY,
    targetDate: TODAY,
    policy: DEFAULT_FRESHNESS,
    prefs: { ...DEFAULT_PREFS },
    ...overrides,
  };
}

export const profile = (chainId: string, zoneId: string | null = null, storeId: string | null = null): PriceProfile => ({
  key: `${chainId}|${zoneId ?? '*'}|${storeId ?? '*'}`,
  chainId,
  zoneId,
  storeId,
});

export { buildOfferIndex };
