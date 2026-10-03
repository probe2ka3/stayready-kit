/**
 * Conditionnements différents : quantité demandée, nombre de paquets entiers, quantité achetée,
 * montant réellement payé (jamais un prix proportionnel impossible à payer), prix unitaire et
 * surplus ; aucune conversion de pièces en grammes ; prix unitaire ≠ coût pour couvrir le besoin.
 */
import { describe, expect, it } from 'vitest';
import { buildOfferIndex, compareBasket, DEFAULT_PREFS, DEFAULT_TRAVEL, quantityGap, resolveLine, withCrowDistance, type Chain, type Store } from '../src';
import { canonical, ctx, match, price, product, profile } from './fixtures';

const AT = '2026-09-26T08:00:00Z';
const line = (productId: string, qty = 1) => ({ id: `l-${productId}`, productId, qty });

describe('paquets entiers et montant payé', () => {
  const oranges = canonical('oranges', 2000);
  const citrons = canonical('citrons', 500);

  it('besoin de 2 kg, sachets de 1 kg : deux sachets, 2 kg achetés, montant = 2 × prix du sachet', () => {
    const index = buildOfferIndex({ products: [product('a-or', 'a', 1000)], matches: [match('oranges', 'a-or', 'similar')], prices: [price('a-or', 195, AT)], promotions: [] });
    const r = resolveLine(line('oranges'), oranges, profile('a'), index, ctx());
    expect(r.option).toMatchObject({
      packs: 2,
      requestedQuantity: { amount: 2000, unit: 'g' },
      purchasedQuantity: { amount: 2000, unit: 'g' },
      totalCents: 390,
      unitPrice: { basis: 'kg', cents: 195 },
    });
    expect(quantityGap(r.option!.requestedQuantity, r.option!.purchasedQuantity)).toEqual({ surplus: null, shortfall: null });
  });

  it('arrondi au conditionnement supérieur : 3 sachets de 750 g pour 2 kg, surplus 250 g payé', () => {
    const index = buildOfferIndex({ products: [product('a-or', 'a', 750)], matches: [match('oranges', 'a-or', 'similar')], prices: [price('a-or', 150, AT)], promotions: [] });
    const r = resolveLine(line('oranges'), oranges, profile('a'), index, ctx());
    // 3 × 1.50 = 4.50, pas 2000/750 × 1.50 = 4.00 (impossible à payer en magasin).
    expect(r.option).toMatchObject({ packs: 3, purchasedQuantity: { amount: 2250, unit: 'g' }, totalCents: 450, unitPrice: { basis: 'kg', cents: 200 } });
    expect(quantityGap(r.option!.requestedQuantity, r.option!.purchasedQuantity).surplus).toEqual({ amount: 250, unit: 'g' });
    expect(r.option?.statusReasons).toContain('pack_size_differs');
  });

  it('paquet un peu plus petit (tolérance de 10 %) : un paquet, manque signalé', () => {
    const index = buildOfferIndex({ products: [product('a-ci', 'a', 450)], matches: [match('citrons', 'a-ci')], prices: [price('a-ci', 199, AT)], promotions: [] });
    const r = resolveLine(line('citrons'), citrons, profile('a'), index, ctx());
    expect(r.option).toMatchObject({ packs: 1, purchasedQuantity: { amount: 450, unit: 'g' }, totalCents: 199 });
    expect(quantityGap(r.option!.requestedQuantity, r.option!.purchasedQuantity).shortfall).toEqual({ amount: 50, unit: 'g' });
  });

  it('pièces jamais converties en grammes : un citron « à la pièce » ne couvre pas un besoin en grammes', () => {
    const index = buildOfferIndex({ products: [product('a-ci', 'a', 1, 'piece')], matches: [match('citrons', 'a-ci')], prices: [price('a-ci', 39, AT)], promotions: [] });
    const r = resolveLine(line('citrons'), citrons, profile('a'), index, ctx());
    expect(r.option).toBeNull();
    expect(r.unavailable?.reason).toBe('filtered_by_preferences');
  });
});

describe('prix unitaire ou coût pour couvrir le besoin (article par article)', () => {
  const HOME = { lat: 46.62, lon: 7.06 };
  const NOW = new Date('2026-09-28T08:00:00Z');
  const chain = (id: string): Chain => ({ id, name: id.toUpperCase(), badge: id.toUpperCase(), website: '', status: 'active', promoCalendar: { waves: [], verifiedAt: '2026-09-27', sourceUrl: '' }, loyaltyPrograms: [] });
  const store = (id: string, chainId: string, km: number): Store => ({
    id,
    chainId,
    name: `${chainId} ${id}`,
    lat: HOME.lat + km / 111.2,
    lon: HOME.lon,
    openingHours: 'Mo-Sa 08:00-19:00; Su off; PH off',
    source: { connectorId: 'osm', kind: 'open_data' },
  });
  const at = '2026-09-28T05:00:00Z';
  // Besoin : 2 kg. A : sachet de 1 kg à 1.50 (2 sachets = 3.00, 1.50/kg).
  // B : sac de 3 kg à 3.60 (1.20/kg, moins cher au kilo, mais 3.60 et 1 kg de surplus).
  const index = buildOfferIndex({
    products: [product('a-or', 'a', 1000), product('b-or', 'b', 3000)],
    matches: [match('oranges', 'a-or', 'similar'), match('oranges', 'b-or', 'similar')],
    prices: [price('a-or', 150, at), price('b-or', 360, at)],
    promotions: [],
  });

  it('moins cher au kilo ≠ moins cher pour le besoin ; surplus et quantités achetées exposés, aucun écart chiffré', async () => {
    const r = await compareBasket(
      {
        origin: HOME,
        lines: [line('oranges')],
        prefs: DEFAULT_PREFS,
        when: { mode: 'now' },
        maxStores: 2,
        travel: { ...DEFAULT_TRAVEL, costPerKmChf: 0.7 },
        minSavingPerExtraStoreCents: 100,
      },
      { now: NOW, products: new Map([['oranges', canonical('oranges', 2000)]]), chains: new Map(['a', 'b'].map((c) => [c, chain(c)])), index, stores: withCrowDistance(HOME, [store('a1', 'a', 1), store('b1', 'b', 1.2)]) },
    );
    const row = r.lineComparisons[0];
    expect(row).toMatchObject({ sameQuantity: false, spreadCents: null, cheapestPerUnitChainId: 'b' });
    expect(row?.offers.map((o) => [o.chainId, o.packs, o.purchasedQuantity.amount, o.totalCents, o.unitPrice.cents, o.surplusQuantity?.amount ?? 0])).toEqual([
      ['a', 2, 2000, 300, 150, 0],
      ['b', 1, 3000, 360, 120, 1000],
    ]);
  });
});
