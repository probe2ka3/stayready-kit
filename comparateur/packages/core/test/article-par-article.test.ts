/**
 * Comparaison article par article (résultat de `compareBasket`) : même article (même code-barres) ou
 * produits équivalents, écart seulement pour des quantités achetées identiques, motifs des prix
 * indicatifs, action réservée à une carte non déclarée (signalée, jamais appliquée), conditionnement
 * différent signalé dans les économies.
 */
import { describe, expect, it } from 'vitest';
import { buildOfferIndex, compareBasket, DEFAULT_PREFS, DEFAULT_TRAVEL, withCrowDistance, type Chain, type CompareRequest, type Store } from '../src';
import { canonical, match, price, product, promo } from './fixtures';

const HOME = { lat: 46.62, lon: 7.06 };
const NOW = new Date('2026-09-28T08:00:00Z'); // lundi 10:00 à Zurich
const AT = '2026-09-28T05:00:00Z';
const chain = (id: string): Chain => ({
  id,
  name: id.toUpperCase(),
  badge: id.slice(0, 2).toUpperCase(),
  website: '',
  status: 'active',
  promoCalendar: { waves: [], verifiedAt: '2026-09-27', sourceUrl: '' },
  loyaltyPrograms: [],
});
const store = (id: string, chainId: string, km: number): Store => ({
  id,
  chainId,
  name: `${chainId} ${id}`,
  lat: HOME.lat + km / 111.2,
  lon: HOME.lon,
  openingHours: 'Mo-Sa 08:00-19:00; Su off; PH off',
  source: { connectorId: 'osm', kind: 'open_data' },
});
const line = (productId: string) => ({ id: `l-${productId}`, productId, qty: 1 });
const products = new Map([canonical('riz', 1000), canonical('cafe', 500), canonical('citrons', 500), canonical('the', 20, 'piece')].map((p) => [p.id, p]));
const chains = new Map(['a', 'b'].map((c) => [c, chain(c)]));
const index = buildOfferIndex({
  products: [
    // Riz : le même article (même code-barres) dans les deux enseignes.
    product('a-riz', 'a', 1000, 'g', { gtin: '7610000000017', brand: 'Marque X' }),
    product('b-riz', 'b', 1000, 'g', { gtin: '7610000000017', brand: 'Marque X' }),
    // Café : produits équivalents (marques propres différentes).
    product('a-cafe', 'a', 500, 'g', { gtin: '7610000000024', brand: 'A' }),
    product('b-cafe', 'b', 500, 'g', { gtin: '7610000000031', brand: 'B' }),
    // Citrons : 750 g chez A, 500 g chez B (quantités achetées différentes).
    product('a-citrons', 'a', 750),
    product('b-citrons', 'b', 500),
    // Thé : seulement chez A (pas de comparaison directe).
    product('a-the', 'a', 20, 'piece'),
  ],
  matches: [
    match('riz', 'a-riz', 'gtin'),
    match('riz', 'b-riz', 'gtin'),
    match('cafe', 'a-cafe'),
    match('cafe', 'b-cafe'),
    match('citrons', 'a-citrons', 'similar'),
    match('citrons', 'b-citrons'),
    match('the', 'a-the'),
  ],
  prices: [
    price('a-riz', 200, AT),
    price('b-riz', 230, AT),
    price('a-cafe', 500, AT),
    price('b-cafe', 450, AT, { reliability: 'crowd', source: { connectorId: 'open-prices', kind: 'open_data', ref: 'x' }, observedAtPlace: 'B Gare, Fribourg' }),
    price('a-citrons', 179, AT),
    price('b-citrons', 150, AT),
    price('a-the', 150, AT),
  ],
  promotions: [
    // Riz chez B : prix carte (1.50) réservé au programme de fidélité de B.
    promo('b-riz', 'b', { promoPriceCents: 150, referencePriceCents: 230, loyaltyProgram: 'lidl-plus', validFrom: '2026-09-28', validTo: '2026-10-04', publishedAt: '2026-09-27T06:00:00Z', verifiedAt: AT }),
  ],
});
const req = (over: Partial<CompareRequest> = {}): CompareRequest => ({
  origin: HOME,
  lines: [line('riz'), line('cafe'), line('citrons'), line('the')],
  prefs: DEFAULT_PREFS,
  when: { mode: 'now' },
  maxStores: 2,
  travel: { ...DEFAULT_TRAVEL, costPerKmChf: 0.7 },
  minSavingPerExtraStoreCents: 100,
  ...over,
});
const deps = () => ({ now: NOW, products, chains, index, stores: withCrowDistance(HOME, [store('a1', 'a', 1), store('b1', 'b', 1.2)]) });

describe('article par article', () => {
  it('même article (même code-barres) ≠ produits équivalents ; un article d’une seule enseigne n’est pas comparé', async () => {
    const r = await compareBasket(req(), deps());
    const byLine = new Map(r.lineComparisons.map((c) => [c.lineId, c]));
    expect([...byLine.keys()]).toEqual(['l-riz', 'l-cafe', 'l-citrons']);
    expect(byLine.get('l-riz')).toMatchObject({ sameArticle: true, sameQuantity: true, spreadCents: 30 });
    expect(byLine.get('l-riz')?.offers.map((o) => [o.chainId, o.totalCents])).toEqual([
      ['a', 200],
      ['b', 230],
    ]);
    expect(byLine.get('l-cafe')).toMatchObject({ sameArticle: false, sameQuantity: true, spreadCents: 50 });
    // Relevé communautaire : lieu du relevé conservé pour l'affichage.
    expect(byLine.get('l-cafe')?.offers[0]).toMatchObject({ chainId: 'b', reliability: 'crowd', observedAtPlace: 'B Gare, Fribourg' });
  });

  it('quantités achetées différentes : aucun écart affiché, et l’économie le signale', async () => {
    const r = await compareBasket(req(), deps());
    const citrons = r.lineComparisons.find((c) => c.lineId === 'l-citrons');
    expect(citrons).toMatchObject({ sameQuantity: false, spreadCents: null });
    expect(citrons?.offers.map((o) => [o.chainId, o.purchasedQuantity.amount])).toEqual([
      ['b', 500],
      ['a', 750],
    ]);
    // A seule couvre tout le panier (thé) : B est incomplète, sans économie ; la combinaison achète les
    // citrons chez B (500 g) au lieu de A (750 g) : signalé.
    const combo = r.solutions.find((s) => s.kind === 'combination');
    expect(combo).toMatchObject({ complete: true, grossSavingsCents: 79, differentQuantityLines: 1 });
    expect(r.solutions.find((s) => s.key === 'chain:a')).toMatchObject({ isReference: true, differentQuantityLines: 0 });
    expect(r.scenarios.find((s) => s.kind === 'cheapest_products')?.savings).toMatchObject({ comparableLines: 4, differentQuantityLines: 1 });
    expect(r.solutions.find((s) => s.key === 'chain:b')?.differentQuantityLines).toBeNull();
  });

  it('action réservée à une carte non déclarée : signalée sur la ligne, jamais appliquée ; appliquée si la carte est déclarée', async () => {
    const r = await compareBasket(req(), deps());
    const b = r.lineComparisons.find((c) => c.lineId === 'l-riz')?.offers.find((o) => o.chainId === 'b');
    expect(b?.totalCents).toBe(230);
    expect(b?.promotion).toBeNull();
    expect(b?.loyaltyOffer).toMatchObject({ program: 'Lidl Plus', totalCents: 150, validTo: '2026-10-04' });
    const withCard = await compareBasket(req({ prefs: { ...DEFAULT_PREFS, loyaltyPrograms: ['lidl-plus'] } }), deps());
    const bCard = withCard.lineComparisons.find((c) => c.lineId === 'l-riz')?.offers.find((o) => o.chainId === 'b');
    expect(bCard?.totalCents).toBe(150);
    expect(bCard?.loyaltyOffer).toBeNull();
  });

  it('motifs des prix indicatifs : relevé communautaire, ou seulement des courses prévues après le relevé', async () => {
    const now = await compareBasket(req(), deps());
    expect(now.meta.chainCoverage.find((c) => c.chainId === 'b')?.indicativeReasons).toEqual({ crowd: 1, survey: 0, aging: 0, promo: 0, futureDate: 0 });
    const later = await compareBasket(req({ when: { mode: 'plan', date: '2026-10-01', time: '10:00' } }), deps());
    const a = later.meta.chainCoverage.find((c) => c.chainId === 'a');
    expect(a?.indicativeLines).toBe(4);
    expect(a?.indicativeReasons).toEqual({ crowd: 0, survey: 0, aging: 0, promo: 0, futureDate: 4 });
  });
});

describe('aliments de base utilisables par enseigne (page des magasins)', () => {
  it('compte selon les règles de la comparaison : zone tarifaire, fraîcheur, source officielle', async () => {
    const { usableNeedsByChain, DEFAULT_FRESHNESS } = await import('../src');
    const lait = canonical('lait', 1000, 'ml');
    const pain = canonical('pain', 500);
    const idx = buildOfferIndex({
      products: [product('m-lait', 'm', 1000, 'ml'), product('m-pain', 'm', 500), product('l-lait', 'l', 1000, 'ml')],
      matches: [match('lait', 'm-lait'), match('pain', 'm-pain'), match('lait', 'l-lait')],
      prices: [
        // Relevé communautaire récent, valable pour la zone « z1 » seulement.
        price('m-lait', 165, AT, { zoneId: 'z1', reliability: 'crowd', source: { connectorId: 'open-prices', kind: 'open_data', ref: 'x' } }),
        // Relevé communautaire de plus de 90 jours : écarté.
        price('m-pain', 250, '2026-06-01T08:00:00Z', { zoneId: 'z1', reliability: 'crowd', source: { connectorId: 'open-prices', kind: 'open_data', ref: 'y' } }),
        // Prix publié par l'enseigne.
        price('l-lait', 159, AT, { reliability: 'official', source: { connectorId: 'lidl-web', kind: 'retailer_site', ref: 'z' } }),
      ],
      promotions: [],
    });
    const ctx = { asOf: NOW, today: '2026-09-28', targetDate: '2026-09-28', policy: DEFAULT_FRESHNESS, prefs: DEFAULT_PREFS };
    const inZone = usableNeedsByChain(idx, [{ ...store('m1', 'm', 1), zoneId: 'z1' }, store('l1', 'l', 1)], [lait, pain], ctx);
    expect(inZone.get('m')).toMatchObject({ needs: 1, official: 0 });
    expect(inZone.get('l')).toMatchObject({ needs: 1, official: 1 });
    const otherZone = usableNeedsByChain(idx, [{ ...store('m2', 'm', 1), zoneId: 'z2' }], [lait, pain], ctx);
    expect(otherZone.get('m')).toBeUndefined();
  });
});

describe('couverture générale ≠ prix vérifié dans un magasin du rayon', () => {
  it('relevé communautaire fait ailleurs (Neuchâtel) : compté « ailleurs » ; relevé en magasin du rayon : « vérifié ici »', async () => {
    const { usableNeedsByChain, DEFAULT_FRESHNESS } = await import('../src');
    const penne = canonical('penne', 500);
    const farine = canonical('farine', 1000);
    const idx = buildOfferIndex({
      products: [product('c-penne', 'c', 500), product('c-farine', 'c', 1000)],
      matches: [match('penne', 'c-penne'), match('farine', 'c-farine')],
      prices: [
        // Open Prices : relevé à Neuchâtel, généralisé au pays (storeId null), lieu réel conservé.
        price('c-penne', 250, AT, { reliability: 'crowd', source: { connectorId: 'open-prices', kind: 'open_data', ref: 'x' }, observedAtPlace: 'Coop, Neuchâtel', observedAtStoreId: 'osm:node/ne' }),
        // Relevé en magasin dans la succursale c1 du rayon.
        price('c-farine', 185, AT, { reliability: 'survey', storeId: 'c1', source: { connectorId: 'releves', kind: 'manual_survey', ref: 'relevé en magasin du 2026-09-28' } }),
      ],
      promotions: [],
    });
    const ctx = { asOf: NOW, today: '2026-09-28', targetDate: '2026-09-28', policy: DEFAULT_FRESHNESS, prefs: DEFAULT_PREFS };
    const u = usableNeedsByChain(idx, [store('c1', 'c', 1)], [penne, farine], ctx).get('c');
    expect(u).toMatchObject({ needs: 2, official: 0, observedInStores: 1, observedElsewhere: 1 });

    const r = await compareBasket(
      { ...req(), lines: [line('penne'), line('farine')] },
      { now: NOW, products: new Map([penne, farine].map((p) => [p.id, p])), chains: new Map([['c', chain('c')], ['a', chain('a')]]), index: buildOfferIndex({
        products: [product('c-penne', 'c', 500), product('c-farine', 'c', 1000), product('a-penne', 'a', 500), product('a-farine', 'a', 1000)],
        matches: [match('penne', 'c-penne'), match('farine', 'c-farine'), match('penne', 'a-penne'), match('farine', 'a-farine')],
        prices: [
          ...idx.pricesByProduct.get('c-penne')!,
          ...idx.pricesByProduct.get('c-farine')!,
          price('a-penne', 119, AT, { reliability: 'official', source: { connectorId: 'lidl-web', kind: 'retailer_site', ref: 'z' } }),
          price('a-farine', 99, AT, { reliability: 'official', source: { connectorId: 'lidl-web', kind: 'retailer_site', ref: 'z' } }),
        ],
        promotions: [],
      }), stores: withCrowDistance(HOME, [store('a1', 'a', 1), store('c1', 'c', 1.2)]) },
    );
    const offer = (lineId: string, chainId: string) => r.lineComparisons.find((c) => c.lineId === lineId)?.offers.find((o) => o.chainId === chainId);
    expect(offer('l-penne', 'c')).toMatchObject({ observedInRadius: false, reliability: 'crowd', observedAtPlace: 'Coop, Neuchâtel' });
    expect(offer('l-farine', 'c')).toMatchObject({ observedInRadius: true, reliability: 'survey', status: 'indicative' });
    expect(offer('l-farine', 'a')?.observedInRadius).toBeNull();
    expect(r.meta.chainCoverage.find((c) => c.chainId === 'c')?.indicativeReasons).toMatchObject({ crowd: 1, survey: 1 });
  });
});
