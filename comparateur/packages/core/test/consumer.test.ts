/**
 * Comparateur grand public (phase 4) : erreurs sensibles pour un particulier.
 * Correspondances, quantités et paquets, paniers incomplets, promotions futures ou expirées,
 * restrictions régionales, conditions (carte, quantité, 2e paquet), trajet et économie nette.
 */
import { describe, expect, it } from 'vitest';
import {
  buildOfferIndex,
  compareBasket,
  DEFAULT_PREFS,
  DEFAULT_TRAVEL,
  promotionConfirmedOn,
  promotionCost,
  resolveLine,
  withCrowDistance,
  type Chain,
  type CompareRequest,
  type Store,
} from '../src';
import { canonical, ctx, match, price, product, profile, promo } from './fixtures';

const line = (productId: string, qty = 1) => ({ id: `l-${productId}`, productId, qty });

describe('correspondances : jamais un article non équivalent', () => {
  const pates = canonical('pates', 500);
  const bio = canonical('lait-bio', 1000, 'ml', { attributes: { organic: true } });
  const nutella = canonical('nutella', 450, 'g', { brandRequired: 'Nutella' });

  it('ignore une correspondance proposée mais non validée', () => {
    const index = buildOfferIndex({
      products: [product('x-pates', 'x', 500)],
      matches: [{ ...match('pates', 'x-pates'), status: 'suggested' }],
      prices: [price('x-pates', 99)],
      promotions: [],
    });
    const out = resolveLine(line('pates'), pates, profile('x'), index, ctx());
    expect(out.option).toBeNull();
    expect(out.unavailable?.reason).toBe('no_match');
  });

  it('bio exigé : un article conventionnel, même validé, n’est pas retenu', () => {
    const index = buildOfferIndex({
      products: [product('x-lait', 'x', 1000, 'ml', { attributes: { organic: false } })],
      matches: [match('lait-bio', 'x-lait')],
      prices: [price('x-lait', 120)],
      promotions: [],
    });
    const out = resolveLine(line('lait-bio'), bio, profile('x'), index, ctx());
    expect(out.unavailable?.reason).toBe('filtered_by_preferences');
  });

  it('préférence « bio uniquement » : le conventionnel est écarté, le bio retenu', () => {
    const index = buildOfferIndex({
      products: [product('x-pates', 'x', 500), product('x-pates-bio', 'x', 500, 'g', { attributes: { organic: true } })],
      matches: [match('pates', 'x-pates'), match('pates', 'x-pates-bio')],
      prices: [price('x-pates', 99), price('x-pates-bio', 249)],
      promotions: [],
    });
    const out = resolveLine(line('pates'), pates, profile('x'), index, ctx({ prefs: { ...DEFAULT_PREFS, organicOnly: true } }));
    expect(out.option?.retailerProductId).toBe('x-pates-bio');
    expect(out.option?.totalCents).toBe(249);
  });

  it('un yogourt « sans lactose » n’est pas l’équivalent d’un yogourt nature ordinaire (et inversement accepté si exigé)', () => {
    const yog = canonical('yogourt', 180);
    const lf = canonical('yogourt-lf', 180, 'g', { attributes: { labels: ['lactose-free'] } });
    const index = buildOfferIndex({
      products: [product('x-yog-lf', 'x', 500, 'g', { name: 'Yogourt nature sans lactose 3.5%', attributes: { labels: ['lactose-free'] } })],
      matches: [match('yogourt', 'x-yog-lf', 'similar'), match('yogourt-lf', 'x-yog-lf', 'similar')],
      prices: [price('x-yog-lf', 179)],
      promotions: [],
    });
    expect(resolveLine(line('yogourt'), yog, profile('x'), index, ctx()).option).toBeNull();
    expect(resolveLine(line('yogourt-lf'), lf, profile('x'), index, ctx()).option?.totalCents).toBe(179);
  });

  it('marque imposée et dimension : pas de pâte à tartiner d’une autre marque, pas de litre pour des grammes', () => {
    const index = buildOfferIndex({
      products: [product('x-tartiner', 'x', 400, 'g', { name: 'Pâte à tartiner noisettes', brand: 'Nusspli' }), product('x-ml', 'x', 500, 'ml')],
      matches: [match('nutella', 'x-tartiner'), match('pates', 'x-ml')],
      prices: [price('x-tartiner', 299), price('x-ml', 99)],
      promotions: [],
    });
    expect(resolveLine(line('nutella'), nutella, profile('x'), index, ctx()).option).toBeNull();
    expect(resolveLine(line('pates'), pates, profile('x'), index, ctx()).option).toBeNull();
  });
});

describe('quantités et paquets : le montant réellement payé', () => {
  const run = (req: { canonicalAmount: number; qty: number; pack: number; cents: number }) => {
    const c = canonical('ref', req.canonicalAmount);
    const index = buildOfferIndex({
      products: [product('x-ref', 'x', req.pack)],
      matches: [match('ref', 'x-ref', req.pack === req.canonicalAmount ? 'equivalent' : 'similar')],
      prices: [price('x-ref', req.cents)],
      promotions: [],
    });
    return resolveLine(line('ref', req.qty), c, profile('x'), index, ctx()).option!;
  };

  it('2 × 150 g demandés, paquets de 125 g : 3 paquets payés, 375 g achetés', () => {
    const o = run({ canonicalAmount: 150, qty: 2, pack: 125, cents: 79 });
    expect(o.packs).toBe(3);
    expect(o.totalCents).toBe(237);
    expect(o.requestedQuantity).toEqual({ amount: 300, unit: 'g' });
    expect(o.purchasedQuantity).toEqual({ amount: 375, unit: 'g' });
    expect(o.statusReasons).toContain('pack_size_differs');
  });

  it('1 × 500 g demandé, seul un paquet de 1 kg existe : le paquet entier est payé (pas le prix au kilo × 0,5)', () => {
    const o = run({ canonicalAmount: 500, qty: 1, pack: 1000, cents: 119 });
    expect(o.packs).toBe(1);
    expect(o.totalCents).toBe(119);
  });

  it('2 × 500 g demandés, paquet de 1 kg : un seul paquet', () => {
    expect(run({ canonicalAmount: 500, qty: 2, pack: 1000, cents: 119 }).totalCents).toBe(119);
  });

  it('4 × 180 g demandés, pots de 500 g : 2 pots', () => {
    const o = run({ canonicalAmount: 180, qty: 4, pack: 500, cents: 79 });
    expect(o.packs).toBe(2);
    expect(o.totalCents).toBe(158);
  });
});

describe('conditions des promotions : appliquées seulement si elles sont remplies', () => {
  it('« -50 % sur le 2e paquet » : prix normal pour un paquet, rabais sur un paquet sur deux', () => {
    const p = promo('x', 'x', { type: 'nth_percent', percent: 50, buyQty: 2, promoPriceCents: null });
    expect(promotionCost(p, 1, 179)).toBeNull();
    expect(promotionCost(p, 2, 179)).toBe(179 + 90);
    expect(promotionCost(p, 3, 179)).toBe(179 * 2 + 90);
    expect(promotionCost(p, 4, 179)).toBe(2 * (179 + 90));
  });

  it('prix « dès » ou variable selon la variante : jamais appliqué au panier', () => {
    expect(promotionCost(promo('x', 'x', { type: 'conditional', promoPriceCents: 219 }), 1, 299)).toBeNull();
  });

  it('prix dès 2 pièces : non appliqué pour une seule pièce', () => {
    const p = promo('x', 'x', { type: 'min_qty_price', promoPriceCents: 150, minQty: 2 });
    expect(promotionCost(p, 1, 200)).toBeNull();
    expect(promotionCost(p, 2, 200)).toBe(300);
  });

  it('prix avec carte (Lidl Plus) : seulement si l’utilisateur déclare la carte, condition affichée', () => {
    const c = canonical('beurre', 250);
    const index = buildOfferIndex({
      products: [product('x-beurre', 'x', 250)],
      matches: [match('beurre', 'x-beurre')],
      prices: [price('x-beurre', 339)],
      promotions: [promo('x-beurre', 'x', { promoPriceCents: 279, loyaltyProgram: 'lidl-plus', validFrom: '2026-09-24', validTo: '2026-09-30' })],
    });
    expect(resolveLine(line('beurre'), c, profile('x'), index, ctx()).option?.totalCents).toBe(339);
    const withCard = resolveLine(line('beurre'), c, profile('x'), index, ctx({ prefs: { ...DEFAULT_PREFS, loyaltyPrograms: ['lidl-plus'] } })).option!;
    expect(withCard.totalCents).toBe(279);
    expect(withCard.statusReasons).toContain('loyalty_required');
    expect(withCard.promotion?.conditions.join(' ')).toMatch(/Lidl Plus/);
  });
});

describe('dates : promotions futures, expirées, fin non publiée', () => {
  const c = canonical('huile', 1000, 'ml');
  const index = buildOfferIndex({
    products: [product('x-huile', 'x', 1000, 'ml')],
    matches: [match('huile', 'x-huile')],
    prices: [price('x-huile', 349, '2026-09-27T06:00:00Z')],
    promotions: [
      // Annoncée le 25.09 pour la semaine du 01.10.
      promo('x-huile', 'x', { promoPriceCents: 299, validFrom: '2026-10-01', validTo: '2026-10-07', publishedAt: '2026-09-25T06:00:00Z' }),
      // Expirée la veille.
      promo('x-huile', 'x', { promoPriceCents: 249, validFrom: '2026-09-20', validTo: '2026-09-26' }),
      // Publiée après l'instant de la requête : inconnue.
      promo('x-huile', 'x', { promoPriceCents: 199, validFrom: '2026-10-08', validTo: '2026-10-14', publishedAt: '2026-09-29T06:00:00Z' }),
    ],
  });

  it('aujourd’hui : l’action expirée n’est pas appliquée', () => {
    const o = resolveLine(line('huile'), c, profile('x'), index, ctx()).option!;
    expect(o.totalCents).toBe(349);
    expect(o.promotion).toBeNull();
  });

  it('date future couverte par une action annoncée : action appliquée, signalée comme annoncée', () => {
    const o = resolveLine(line('huile'), c, profile('x'), index, ctx({ targetDate: '2026-10-02' })).option!;
    expect(o.totalCents).toBe(299);
    expect(o.status).toBe('promo_confirmed');
    expect(o.promotion?.announced).toBe(true);
  });

  it('date future sans action publiée : dernier prix connu, indicatif, jamais une action non encore publiée', () => {
    const o = resolveLine(line('huile'), c, profile('x'), index, ctx({ targetDate: '2026-10-10' })).option!;
    expect(o.totalCents).toBe(349);
    expect(o.status).toBe('indicative');
    expect(o.statusReasons).toContain('future_date');
  });

  it('fin non publiée : confirmée jusqu’au dernier jour vu en vigueur (ou premier jour annoncé), indicative ensuite', () => {
    const seen = { endIsPresumed: true, validFrom: '2026-09-27', verifiedAt: '2026-09-27T06:00:00Z' };
    expect(promotionConfirmedOn(seen, '2026-09-27')).toBe(true);
    expect(promotionConfirmedOn(seen, '2026-09-30')).toBe(false);
    const announced = { endIsPresumed: true, validFrom: '2026-10-01', verifiedAt: '2026-09-27T06:00:00Z' };
    expect(promotionConfirmedOn(announced, '2026-10-01')).toBe(true);
    expect(promotionConfirmedOn(announced, '2026-10-04')).toBe(false);
    expect(promotionConfirmedOn({ ...seen, endIsPresumed: false }, '2026-09-30')).toBe(true);

    const idx = buildOfferIndex({
      products: [product('x-huile', 'x', 1000, 'ml')],
      matches: [match('huile', 'x-huile')],
      prices: [price('x-huile', 349, '2026-09-27T06:00:00Z')],
      promotions: [promo('x-huile', 'x', { promoPriceCents: 299, ...seen, validTo: '2026-10-03', whileStocksLast: true })],
    });
    const later = resolveLine(line('huile'), c, profile('x'), idx, ctx({ targetDate: '2026-09-30' })).option!;
    expect(later.totalCents).toBe(299);
    expect(later.status).toBe('indicative');
    expect(later.statusReasons).toEqual(expect.arrayContaining(['promo_end_presumed', 'promo_not_confirmed_on_date']));
  });
});

describe('restrictions régionales', () => {
  it('une action « valable uniquement en Suisse romande » ne s’applique pas à une succursale alémanique', () => {
    const c = canonical('filet', 1000);
    const index = buildOfferIndex({
      products: [product('x-filet', 'x', 1000)],
      matches: [match('filet', 'x-filet')],
      prices: [price('x-filet', 1990)],
      promotions: [promo('x-filet', 'x', { promoPriceCents: 1590, zoneId: 'x-romandie', regionNote: 'valable uniquement en Suisse romande' })],
    });
    const romandie = resolveLine(line('filet'), c, profile('x', 'x-romandie'), index, ctx()).option!;
    expect(romandie.totalCents).toBe(1590);
    expect(romandie.promotion?.conditions).toContain('valable uniquement en Suisse romande');
    expect(resolveLine(line('filet'), c, profile('x', 'x-deutschschweiz'), index, ctx()).option?.totalCents).toBe(1990);
  });
});

/* ------------------------------------------------------------------ */
/* Solutions comparées, panier incomplet, trajet et économie nette    */
/* ------------------------------------------------------------------ */

const HOME = { lat: 46.52, lon: 6.63 };
const NOW = new Date('2026-09-28T08:00:00Z'); // lundi 10:00 à Zurich
const chain = (id: string): Chain => ({
  id,
  name: id.toUpperCase(),
  badge: id.slice(0, 2).toUpperCase(),
  website: '',
  status: 'active',
  promoCalendar: { waves: [], verifiedAt: '2026-09-27', sourceUrl: '' },
  loyaltyPrograms: [],
});
/** Succursale à `km` kilomètres au nord du départ (1° de latitude ≈ 111,2 km). */
const store = (id: string, chainId: string, km: number): Store => ({
  id,
  chainId,
  name: `${chainId} ${id}`,
  lat: HOME.lat + km / 111.2,
  lon: HOME.lon,
  openingHours: 'Mo-Sa 08:00-19:00; Su off; PH off',
  source: { connectorId: 'osm', kind: 'open_data' },
});
const products = new Map([canonical('riz', 1000), canonical('cafe', 500), canonical('the', 20, 'piece')].map((p) => [p.id, p]));
const chains = new Map(['a', 'b', 'c'].map((c) => [c, chain(c)]));
// A : tout le panier ; B : tout, plus cher sauf le café ; C : seulement le riz, très bon marché.
const index = buildOfferIndex({
  products: [
    product('a-riz', 'a', 1000),
    product('a-cafe', 'a', 500),
    product('a-the', 'a', 20, 'piece'),
    product('b-riz', 'b', 1000),
    product('b-cafe', 'b', 500),
    product('b-the', 'b', 20, 'piece'),
    product('c-riz', 'c', 1000),
  ],
  matches: ['a', 'b'].flatMap((x) => [match('riz', `${x}-riz`), match('cafe', `${x}-cafe`), match('the', `${x}-the`)]).concat(match('riz', 'c-riz')),
  prices: [
    price('a-riz', 200, '2026-09-28T05:00:00Z'),
    price('a-cafe', 500, '2026-09-28T05:00:00Z'),
    price('a-the', 150, '2026-09-28T05:00:00Z'),
    price('b-riz', 220, '2026-09-28T05:00:00Z'),
    price('b-cafe', 300, '2026-09-28T05:00:00Z'),
    price('b-the', 160, '2026-09-28T05:00:00Z'),
    price('c-riz', 50, '2026-09-28T05:00:00Z'),
  ],
  promotions: [],
});
const req = (over: Partial<CompareRequest> = {}): CompareRequest => ({
  origin: HOME,
  lines: [line('riz'), line('cafe'), line('the')],
  prefs: DEFAULT_PREFS,
  when: { mode: 'now' },
  maxStores: 2,
  travel: { ...DEFAULT_TRAVEL, costPerKmChf: 0.7 },
  minSavingPerExtraStoreCents: 100,
  ...over,
});
const deps = (stores: Store[], now = NOW) => ({ now, products, chains, index, stores: withCrowDistance(HOME, stores) });

describe('solutions comparées : enseigne seule et combinaison', () => {
  it('un panier incomplet n’est jamais présenté comme moins cher : pas d’économie calculée', async () => {
    const r = await compareBasket(req(), deps([store('a1', 'a', 1), store('b1', 'b', 1.2), store('c1', 'c', 0.5)]));
    const byKey = new Map(r.solutions.map((s) => [s.key, s]));
    const c = byKey.get('chain:c')!;
    expect(c.complete).toBe(false);
    expect(c.coveredLines).toBe(1);
    expect(c.purchaseCents).toBe(50);
    expect(c.grossSavingsCents).toBeNull();
    expect(c.netSavingsCents).toBeNull();
    expect(c.notComparable).toBe('incomplete');
    // Les solutions complètes passent avant les incomplètes, quel que soit leur prix.
    expect(r.solutions.findIndex((s) => s.key === 'chain:c')).toBeGreaterThan(r.solutions.findIndex((s) => s.key === 'chain:a'));
    const ranking = r.singleStoreRanking.find((x) => x.chainId === 'c')!;
    expect(ranking.isComplete).toBe(false);
    expect(ranking.coverageRate).toBeCloseTo(1 / 3);
  });

  it('couverture par enseigne du rayon, y compris une enseigne sans aucun prix (jamais présentée comme comparée)', async () => {
    const r = await compareBasket(req(), deps([store('a1', 'a', 1), store('c1', 'c', 0.5), store('d1', 'd', 0.8)]));
    expect(r.meta.chainCoverage.map((c) => [c.chainId, c.coveredLines, c.indicativeLines])).toEqual([
      ['a', 3, 0],
      ['c', 1, 0],
      ['d', 0, 0],
    ]);
    expect(r.solutions.some((s) => s.key === 'chain:d')).toBe(false);
  });

  it('enseignes avec prix fermées ce jour-là : aucun scénario « vide », avertissement et couverture explicites', async () => {
    // Dimanche 04.10.2026 : A et B fermées le dimanche ; D (sans aucun prix) ouverte.
    const sundayOpen = { ...store('d1', 'd', 0.3), openingHours: 'Mo-Su 08:00-20:00' };
    const r = await compareBasket(
      req({ when: { mode: 'plan', date: '2026-10-04', time: '10:00' } }),
      deps([store('a1', 'a', 1), store('b1', 'b', 1.2), sundayOpen], new Date('2026-10-03T08:00:00Z')),
    );
    expect(r.scenarios).toEqual([]);
    expect(r.meta.warnings).toEqual(expect.arrayContaining(['no_priced_store_open', 'stores_closed_on_date']));
    expect(r.meta.warnings).not.toContain('no_open_store');
    const a = r.meta.chainCoverage.find((c) => c.chainId === 'a');
    expect(a).toMatchObject({ coveredLines: 3, openStores: 0 });
    expect(r.meta.chainCoverage.find((c) => c.chainId === 'd')).toMatchObject({ coveredLines: 0, openStores: 1 });
  });

  it('référence = meilleur magasin unique complet, trajet compris ; économies brute et nette', async () => {
    const r = await compareBasket(req(), deps([store('a1', 'a', 1), store('b1', 'b', 1.2)]));
    const a = r.solutions.find((s) => s.key === 'chain:a')!;
    const b = r.solutions.find((s) => s.key === 'chain:b')!;
    // A : 8.50 ; B : 6.80 → B est la référence (achats moins chers, trajet presque identique).
    expect(a.purchaseCents).toBe(850);
    expect(b.purchaseCents).toBe(680);
    expect(b.isReference).toBe(true);
    expect(a.grossSavingsCents).toBe(680 - 850);
    expect(a.netSavingsCents).toBe(b.globalCents - a.globalCents);
    const combo = r.solutions.find((s) => s.key === 'combination')!;
    // Riz et thé chez A (2.00 + 1.50), café chez B (3.00) = 6.50.
    expect(combo.purchaseCents).toBe(650);
    expect(combo.grossSavingsCents).toBe(30);
    expect(combo.netSavingsCents).toBe(b.globalCents - combo.globalCents);
    expect(combo.globalCents).toBe(combo.purchaseCents + combo.travelCostCents);
  });

  it('détour : un gain d’achats inférieur au coût du trajet donne une économie nette négative, combinaison non retenue', async () => {
    // B à 1 km, A à 6 km : l'économie de 0.30 CHF ne couvre pas ~13 km de plus à 0.70 CHF/km.
    const r = await compareBasket(req(), deps([store('a1', 'a', 6), store('b1', 'b', 1)]));
    const combo = r.solutions.find((s) => s.key === 'combination')!;
    expect(combo.grossSavingsCents).toBe(30);
    expect(combo.netSavingsCents).toBeLessThan(0);
    expect(combo.retained).toBe(false);
    expect(r.scenarios.find((s) => s.kind === 'optimized_total')?.storeCount).toBe(1);
  });

  it('trajet estimé aller-retour : vol d’oiseau × 1,3, coût = distance × coût par km modifiable', async () => {
    const r = await compareBasket(req({ maxStores: 1 }), deps([store('b1', 'b', 2)]));
    const b = r.solutions.find((s) => s.key === 'chain:b')!;
    expect(r.meta.travelMethod).toMatchObject({ estimated: true, detourFactor: 1.3, returnToOrigin: true, costPerKmChf: 0.7 });
    expect(b.distanceKm).toBeCloseTo(2 * 2 * 1.3, 1);
    expect(b.travelCostCents).toBe(Math.round(b.distanceKm * 0.7 * 100));
    const cheaperKm = await compareBasket(req({ maxStores: 1, travel: { ...DEFAULT_TRAVEL, costPerKmChf: 0.2 } }), deps([store('b1', 'b', 2)]));
    expect(cheaperKm.solutions[0]?.travelCostCents).toBe(Math.round(b.distanceKm * 0.2 * 100));
    const oneWay = await compareBasket(req({ maxStores: 1, travel: { ...DEFAULT_TRAVEL, costPerKmChf: 0.7, returnToOrigin: false } }), deps([store('b1', 'b', 2)]));
    expect(oneWay.solutions[0]?.distanceKm).toBeCloseTo(2 * 1.3, 1);
  });

  it('aucun magasin complet : économies non calculées pour toutes les solutions, articles introuvables listés', async () => {
    const r = await compareBasket(req(), deps([store('c1', 'c', 0.5)]));
    expect(r.solutions.every((s) => s.notComparable === 'no_complete_reference' && s.netSavingsCents === null)).toBe(true);
    expect(r.unavailableEverywhere.map((u) => u.productName).sort()).toEqual(['cafe', 'the']);
  });

  it('collecte en panne depuis plus de 48 h : avertissement et dates des relevés', async () => {
    const later = new Date('2026-10-01T08:00:00Z');
    const r = await compareBasket(req(), deps([store('a1', 'a', 1), store('b1', 'b', 1.2)], later));
    expect(r.meta.warnings).toContain('prices_not_refreshed');
    expect(r.meta.priceDates.find((d) => d.chainId === 'a')?.newest).toBe('2026-09-28T05:00:00Z');
  });
});

describe('droits de réutilisation des sources', () => {
  it('Aldi, Denner et le journal Coop (réutilisation publique soumise à accord) sont exclus sans autorisation enregistrée', async () => {
    const { restrictedConnectorIds, SOURCE_REGISTRY } = await import('../src');
    expect(SOURCE_REGISTRY['aldi-api']?.publicUse).toBe('requires_authorization');
    expect(SOURCE_REGISTRY['lidl-web']?.publicUse).toBe('no_restriction_found');
    expect(SOURCE_REGISTRY['open-prices']?.publicUse).toBe('open_license');
    expect(SOURCE_REGISTRY.foodally?.publicUse).toBe('licence_required');
    expect(SOURCE_REGISTRY['denner-web']?.publicUse).toBe('requires_authorization');
    expect(SOURCE_REGISTRY['coop-epaper']?.publicUse).toBe('requires_authorization');
    expect(restrictedConnectorIds([])).toEqual(['aldi-api', 'denner-web', 'coop-epaper']);
    expect(restrictedConnectorIds(['aldi-api'])).toEqual(['denner-web', 'coop-epaper']);
    expect(restrictedConnectorIds(['aldi-api', 'denner-web', 'coop-epaper'])).toEqual([]);
  });

  it('une source exclue disparaît entièrement de l’index (articles, prix, actions)', () => {
    const c = canonical('pates', 500);
    const aldiSource = { connectorId: 'aldi-api', kind: 'retailer_site' as const };
    const idx = buildOfferIndex(
      {
        products: [product('aldi:1', 'aldi', 500, 'g', { connectorId: 'aldi-api' })],
        matches: [match('pates', 'aldi:1')],
        prices: [price('aldi:1', 119, '2026-09-27T06:00:00Z', { source: aldiSource })],
        promotions: [promo('aldi:1', 'aldi', { promoPriceCents: 99, source: aldiSource })],
      },
      { excludeConnectors: ['aldi-api'] },
    );
    expect(idx.products.size).toBe(0);
    expect(resolveLine(line('pates'), c, profile('aldi'), idx, ctx()).unavailable?.reason).toBe('no_match');
  });

  it('provenance : l’hôte de l’URL l’emporte sur l’étiquette, la source la plus restrictive gagne', async () => {
    const { connectorForUrl, recordProvenance } = await import('../src');
    expect(connectorForUrl('https://api.aldi-suisse.ch/v3/product-search')).toBe('aldi-api');
    expect(connectorForUrl('https://www.denner.ch/fr/aktionen')).toBe('denner-web');
    expect(connectorForUrl('https://epaper.cooperation.ch/x.pdf')).toBe('coop-epaper');
    expect(connectorForUrl('https://sortiment.lidl.ch/fr/lait')).toBe('lidl-web');
    expect(connectorForUrl('https://prices.openfoodfacts.org/prices/42')).toBe('open-prices');
    expect(connectorForUrl('https://notdenner.ch/')).toBeNull();
    expect(connectorForUrl('ref-interne-42')).toBeNull();
    const op = 'https://prices.openfoodfacts.org/prices/42';
    // Relevé Open Prices dans un magasin Coop : provenance Open Prices, publiable (ODbL).
    expect(recordProvenance('open-prices', ['open-prices'], [op])).toBe('open-prices');
    // Prix privé réétiqueté : l'URL Aldi, l'étiquette ou le fichier privé suffisent à le rattacher à Aldi.
    expect(recordProvenance('open-prices', ['open-prices'], ['https://api.aldi-suisse.ch/v3/x'])).toBe('aldi-api');
    expect(recordProvenance('open-prices', ['aldi-api'], [op])).toBe('aldi-api');
    expect(recordProvenance('aldi-api', ['open-prices'], [op])).toBe('aldi-api');
    // Source publiable : provenance non établie sans URL, avec un hôte inconnu ou une autre source publiable.
    expect(recordProvenance('open-prices', ['open-prices'], [null, 'ref-42'])).toBeNull();
    expect(recordProvenance('open-prices', ['open-prices'], ['https://example.org/prix'])).toBeNull();
    expect(recordProvenance('open-prices', ['lidl-web'], [op])).toBeNull();
    // Source sans hôtes déclarés (relevés en magasin) : étiquette seule.
    expect(recordProvenance('releves', ['releves'], [])).toBe('releves');
  });

  it('relevé communautaire : utilisé, daté et local jusqu’à 90 jours, retiré automatiquement au-delà', () => {
    const c = canonical('cafe', 500);
    const op = { connectorId: 'open-prices', kind: 'open_data' as const };
    const idx = buildOfferIndex({
      products: [product('migros:gtin-1', 'migros', 500, 'g', { connectorId: 'open-prices' })],
      matches: [match('cafe', 'migros:gtin-1')],
      prices: [price('migros:gtin-1', 350, '2026-08-04T10:00:00Z', { source: op, reliability: 'crowd', zoneId: 'migros-nf' })],
      promotions: [],
    });
    const zone = { key: 'migros|migros-nf|*', chainId: 'migros', zoneId: 'migros-nf', storeId: null };
    const at = (iso: string) => ctx({ asOf: new Date(iso), today: iso.slice(0, 10), targetDate: iso.slice(0, 10) });
    const before = resolveLine(line('cafe'), c, zone, idx, at('2026-11-01T10:00:00Z'));
    expect(before.option).toMatchObject({ status: 'indicative', observedAt: '2026-08-04T10:00:00Z' });
    expect(before.option?.statusReasons).toContain('zone_price');
    // Ailleurs que dans la zone du relevé : jamais utilisé.
    expect(resolveLine(line('cafe'), c, { ...zone, key: 'migros|migros-zh|*', zoneId: 'migros-zh' }, idx, at('2026-10-03T10:00:00Z')).option).toBeFalsy();
    const after = resolveLine(line('cafe'), c, zone, idx, at('2026-11-03T10:00:00Z'));
    expect(after.option).toBeFalsy();
    expect(after.unavailable?.reason).toBe('stale_price_excluded');
  });

  it('exclusion : un prix réétiqueté ou rattaché à un article d’une source exclue est retiré', () => {
    const aldiUrl = 'https://www.aldi-suisse.ch/fr/produit/pates-1';
    const opUrl = 'https://prices.openfoodfacts.org/prices/7';
    const op = { connectorId: 'open-prices', kind: 'open_data' as const };
    const idx = buildOfferIndex(
      {
        products: [
          product('aldi:1', 'aldi', 500, 'g', { connectorId: 'open-prices', url: aldiUrl }),
          product('aldi:gtin-7610000000001', 'aldi', 500, 'g', { connectorId: 'open-prices', url: opUrl }),
        ],
        matches: [match('pates', 'aldi:1'), match('pates', 'aldi:gtin-7610000000001')],
        prices: [
          price('aldi:1', 119, '2026-09-27T06:00:00Z', { source: op, sourceUrl: opUrl }),
          price('aldi:gtin-7610000000001', 125, '2026-09-27T06:00:00Z', { source: op, sourceUrl: opUrl }),
          price('aldi:gtin-7610000000001', 99, '2026-09-28T06:00:00Z', { id: 'x', source: { ...op, ref: 'https://api.aldi-suisse.ch/v3/x' }, sourceUrl: opUrl }),
        ],
        promotions: [],
      },
      { excludeConnectors: ['aldi-api'] },
    );
    expect([...idx.products.keys()]).toEqual(['aldi:gtin-7610000000001']);
    expect([...idx.pricesByProduct.values()].flat().map((p) => p.priceCents)).toEqual([125]);
  });
});
