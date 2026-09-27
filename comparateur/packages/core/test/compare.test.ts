import { describe, expect, it } from 'vitest';
import {
  buildOfferIndex,
  compareBasket,
  CompareError,
  DEFAULT_PREFS,
  DEFAULT_TRAVEL,
  withCrowDistance,
  type Chain,
  type CompareRequest,
  type Store,
} from '../src';
import { canonical, match, price, product, promo } from './fixtures';

const HOME = { lat: 46.62, lon: 7.056 };
const NOW = new Date('2026-09-28T08:00:00Z'); // lundi 28.09.2026, 10:00 à Zurich

const chain = (id: string): Chain => ({
  id,
  name: id.toUpperCase(),
  badge: id.slice(0, 2).toUpperCase(),
  website: '',
  status: 'active',
  promoCalendar: { waves: [], verifiedAt: '2026-09-27', sourceUrl: '' },
  loyaltyPrograms: [],
});

const store = (id: string, chainId: string, dLat: number, hours: string | null = 'Mo-Sa 08:00-19:00; Su off; PH off'): Store => ({
  id,
  chainId,
  name: `${chainId} ${id}`,
  lat: HOME.lat + dLat,
  lon: HOME.lon,
  openingHours: hours,
  source: { connectorId: 'osm', kind: 'open_data' },
});

const products = new Map(
  [canonical('farine', 1000), canonical('lait', 1000, 'ml'), canonical('lessive', 40, 'piece')].map((p) => [p.id, p]),
);
const chains = new Map(['a', 'b'].map((c) => [c, chain(c)]));
const index = buildOfferIndex({
  products: [product('a-farine', 'a', 1000), product('a-lait', 'a', 1000, 'ml'), product('b-farine', 'b', 1000), product('b-lessive', 'b', 40, 'piece'), product('a-lessive', 'a', 40, 'piece')],
  matches: [match('farine', 'a-farine'), match('lait', 'a-lait'), match('farine', 'b-farine'), match('lessive', 'b-lessive'), match('lessive', 'a-lessive')],
  prices: [price('a-farine', 200), price('a-lait', 150), price('b-farine', 150), price('b-lessive', 900), price('a-lessive', 1500)],
  promotions: [
    promo('a-lait', 'a', { promoPriceCents: 100, validFrom: '2026-10-01', validTo: '2026-10-07', publishedAt: '2026-09-25T06:00:00Z' }),
    promo('b-farine', 'b', { promoPriceCents: 120, validFrom: '2026-09-24', validTo: '2026-09-30' }),
  ],
});

const req = (overrides: Partial<CompareRequest> = {}): CompareRequest => ({
  origin: HOME,
  lines: [
    { id: 'l1', productId: 'farine', qty: 1 },
    { id: 'l2', productId: 'lait', qty: 2 },
    { id: 'l3', productId: 'lessive', qty: 1 },
  ],
  prefs: DEFAULT_PREFS,
  when: { mode: 'now' },
  maxStores: 2,
  travel: { ...DEFAULT_TRAVEL, costPerKmChf: 0.35 },
  minSavingPerExtraStoreCents: 200,
  ...overrides,
});

const deps = (stores: Store[], now = NOW) => ({ now, products, chains, index, stores: withCrowDistance(HOME, stores) });

describe('comparaison complète', () => {
  it('produit les trois scénarios, la référence et les économies', async () => {
    const r = await compareBasket(req(), deps([store('a1', 'a', 0.01), store('b1', 'b', 0.02)]));
    expect(r.scenarios.map((s) => s.kind)).toEqual(['single_store', 'cheapest_products', 'optimized_total']);
    const single = r.scenarios[0]!;
    expect(single.coveredLines).toBe(3); // seule l'enseigne A a le lait
    expect(single.savings?.isReference).toBe(true);
    const cheapest = r.scenarios[1]!;
    // farine 1.20 (B, promo) + lait 2×1.50 (A) + lessive 9.00 (B)
    expect(cheapest.purchaseCents).toBe(120 + 300 + 900);
    expect(cheapest.storeCount).toBe(2);
    expect(cheapest.savings?.purchaseSavingsCents).toBe(200 + 300 + 1500 - (120 + 300 + 900));
    expect(r.meta.dataMode).toBe('live');
    expect(r.meta.warnings).toContain('travel_estimated');
  });

  it('exclut les magasins fermés et n’envoie personne vers un magasin sans horaires la nuit', async () => {
    const night = new Date('2026-09-28T21:30:00Z'); // 23:30 à Zurich
    const r = await compareBasket(req(), deps([store('a1', 'a', 0.01), store('b1', 'b', 0.02, null)], night));
    expect(r.scenarios).toHaveLength(0);
    expect(r.meta.warnings).toContain('no_open_store');
  });

  it('signale les horaires présumés en journée', async () => {
    const r = await compareBasket(req(), deps([store('a1', 'a', 0.01), store('b1', 'b', 0.02, null)]));
    const opt = r.scenarios.find((s) => s.kind === 'cheapest_products')!;
    const b = opt.stops.find((s) => s.store.chainId === 'b');
    expect(b?.openStatus).toBe('unknown');
    expect(opt.warnings).toContain('presumed_hours');
  });

  it('planifie : compare aujourd’hui et la date choisie avec les promotions annoncées', async () => {
    const r = await compareBasket(
      req({ when: { mode: 'plan', date: '2026-10-02', time: '10:00' } }),
      deps([store('a1', 'a', 0.01), store('b1', 'b', 0.02)]),
    );
    expect(r.planning).not.toBeNull();
    expect(r.planning!.startingPromotions.map((p) => p.productName)).toContain('lait');
    expect(r.planning!.expiringPromotions.map((p) => p.productName)).toContain('farine');
    expect(r.outlook).toHaveLength(10);
  });

  it('refuse une date passée ou trop lointaine', async () => {
    await expect(compareBasket(req({ when: { mode: 'plan', date: '2026-09-20' } }), deps([]))).rejects.toBeInstanceOf(CompareError);
    await expect(compareBasket(req({ when: { mode: 'plan', date: '2027-03-01' } }), deps([]))).rejects.toBeInstanceOf(CompareError);
  });

  it('signale l’absence de magasin dans le rayon', async () => {
    const r = await compareBasket(req(), deps([]));
    expect(r.scenarios).toHaveLength(0);
    expect(r.meta.warnings).toContain('no_stores_in_radius');
  });
});
