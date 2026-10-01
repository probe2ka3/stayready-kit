import { describe, expect, it } from 'vitest';
import { resolveLine, type BasketLine } from '../src';
import { buildOfferIndex, canonical, ctx, match, price, product, profile, promo } from './fixtures';

const flour = canonical('farine-1kg', 1000);
const line = (qty = 1, prefs?: BasketLine['prefs']): BasketLine => ({ id: 'l1', productId: flour.id, qty, prefs });

describe('résolution du prix d’une ligne', () => {
  it('utilise le prix vérifié et calcule le prix unitaire', () => {
    const index = buildOfferIndex({
      products: [product('m-flour', 'migros', 1000)],
      matches: [match(flour.id, 'm-flour')],
      prices: [price('m-flour', 185)],
      promotions: [],
    });
    const out = resolveLine(line(2), flour, profile('migros'), index, ctx());
    expect(out.option?.totalCents).toBe(370);
    expect(out.option?.status).toBe('verified');
    expect(out.option?.unitPrice).toEqual({ basis: 'kg', cents: 185 });
  });

  it('signale une enseigne sans article correspondant', () => {
    const index = buildOfferIndex({ products: [], matches: [], prices: [], promotions: [] });
    expect(resolveLine(line(), flour, profile('coop'), index, ctx()).unavailable?.reason).toBe('no_match');
  });

  it('achète deux paquets de 500 g pour 1 kg et le signale', () => {
    const index = buildOfferIndex({
      products: [product('a-flour', 'aldi', 500)],
      matches: [match(flour.id, 'a-flour', 'similar')],
      prices: [price('a-flour', 95)],
      promotions: [],
    });
    const out = resolveLine(line(), flour, profile('aldi'), index, ctx());
    expect(out.option?.packs).toBe(2);
    expect(out.option?.totalCents).toBe(190);
    expect(out.option?.statusReasons).toContain('pack_size_differs');
    // l'utilisateur peut refuser les conditionnements différents
    const strict = resolveLine(line(), flour, profile('aldi'), index, ctx({ prefs: { ...ctx().prefs, allowSimilarPacks: false } }));
    expect(strict.unavailable?.reason).toBe('filtered_by_preferences');
  });

  it('applique une promotion publiée et valable à la date', () => {
    const index = buildOfferIndex({
      products: [product('c-flour', 'coop', 1000)],
      matches: [match(flour.id, 'c-flour')],
      prices: [price('c-flour', 200)],
      promotions: [promo('c-flour', 'coop', { type: 'percent', percent: 20 })],
    });
    const out = resolveLine(line(), flour, profile('coop'), index, ctx());
    expect(out.option?.totalCents).toBe(160);
    expect(out.option?.status).toBe('promo_confirmed');
    expect(out.option?.regularTotalCents).toBe(200);
    expect(out.option?.promotion?.mechanic).toBe('-20 %');
  });

  it('arrondit les rabais en % aux 5 centimes', () => {
    const index = buildOfferIndex({
      products: [product('c-flour', 'coop', 1000)],
      matches: [match(flour.id, 'c-flour')],
      prices: [price('c-flour', 295)],
      promotions: [promo('c-flour', 'coop', { type: 'percent', percent: 20 })],
    });
    // 2.95 × 0.8 = 2.36 → 2.35
    expect(resolveLine(line(), flour, profile('coop'), index, ctx()).option?.totalCents).toBe(235);
  });

  it('n’applique jamais une promotion expirée ou pas encore commencée', () => {
    const index = buildOfferIndex({
      products: [product('c-flour', 'coop', 1000)],
      matches: [match(flour.id, 'c-flour')],
      prices: [price('c-flour', 200)],
      promotions: [
        promo('c-flour', 'coop', { promoPriceCents: 100, validFrom: '2026-09-17', validTo: '2026-09-23' }),
        promo('c-flour', 'coop', { promoPriceCents: 120, validFrom: '2026-10-01', validTo: '2026-10-07', publishedAt: '2026-09-25T06:00:00Z' }),
      ],
    });
    const out = resolveLine(line(), flour, profile('coop'), index, ctx());
    expect(out.option?.totalCents).toBe(200);
    expect(out.option?.promotion).toBeNull();
    // à la date du 2 octobre, la promotion annoncée s'applique
    const future = resolveLine(line(), flour, profile('coop'), index, ctx({ targetDate: '2026-10-02' }));
    expect(future.option?.totalCents).toBe(120);
    expect(future.option?.status).toBe('promo_confirmed');
  });

  it('distingue publication et début : une promotion non encore publiée est ignorée', () => {
    const index = buildOfferIndex({
      products: [product('m-flour', 'migros', 1000)],
      matches: [match(flour.id, 'm-flour')],
      prices: [price('m-flour', 200)],
      promotions: [
        // publiée le mercredi 30.09 pour le jeudi 01.10 : inconnue au 27.09
        promo('m-flour', 'migros', {
          promoPriceCents: 150,
          validFrom: '2026-10-01',
          validTo: '2026-10-07',
          publishedAt: '2026-09-30T04:00:00Z',
        }),
      ],
    });
    const out = resolveLine(line(), flour, profile('migros'), index, ctx({ targetDate: '2026-10-02' }));
    expect(out.option?.totalCents).toBe(200);
    expect(out.option?.status).toBe('indicative');
    expect(out.option?.statusReasons).toContain('future_date');
  });

  it('respecte les promotions réservées à une carte ou une application', () => {
    const index = buildOfferIndex({
      products: [product('l-flour', 'lidl', 1000)],
      matches: [match(flour.id, 'l-flour')],
      prices: [price('l-flour', 180)],
      promotions: [promo('l-flour', 'lidl', { promoPriceCents: 120, loyaltyProgram: 'lidl-plus' })],
    });
    expect(resolveLine(line(), flour, profile('lidl'), index, ctx()).option?.totalCents).toBe(180);
    const withApp = resolveLine(line(), flour, profile('lidl'), index, ctx({ prefs: { ...ctx().prefs, loyaltyPrograms: ['lidl-plus'] } }));
    expect(withApp.option?.totalCents).toBe(120);
    expect(withApp.option?.statusReasons).toContain('loyalty_required');
  });

  it('calcule les offres « 3 pour 2 »', () => {
    const index = buildOfferIndex({
      products: [product('d-flour', 'denner', 1000)],
      matches: [match(flour.id, 'd-flour')],
      prices: [price('d-flour', 150)],
      promotions: [promo('d-flour', 'denner', { type: 'multibuy', buyQty: 3, payQty: 2 })],
    });
    expect(resolveLine(line(2), flour, profile('denner'), index, ctx()).option?.totalCents).toBe(300);
    expect(resolveLine(line(3), flour, profile('denner'), index, ctx()).option?.totalCents).toBe(300);
    expect(resolveLine(line(4), flour, profile('denner'), index, ctx()).option?.totalCents).toBe(450);
  });

  it('exclut par défaut les prix périmés et conserve le dernier prix connu', () => {
    const index = buildOfferIndex({
      products: [product('o-flour', 'ottos', 1000)],
      matches: [match(flour.id, 'o-flour')],
      prices: [price('o-flour', 150, '2026-07-01T08:00:00Z')],
      promotions: [],
    });
    const out = resolveLine(line(), flour, profile('ottos'), index, ctx());
    expect(out.option).toBeNull();
    expect(out.unavailable?.reason).toBe('stale_price_excluded');
    expect(out.unavailable?.lastKnown?.priceCents).toBe(150);
    const opted = resolveLine(line(), flour, profile('ottos'), index, ctx({ prefs: { ...ctx().prefs, includeStalePrices: true } }));
    expect(opted.option?.status).toBe('stale');
  });

  it('action régionale : appliquée dans sa zone seulement, signalée « prix régional »', () => {
    const index = buildOfferIndex({
      products: [product('c-flour', 'coop', 1000)],
      matches: [match(flour.id, 'c-flour')],
      prices: [],
      promotions: [promo('c-flour', 'coop', { zoneId: 'coop-romandie', promoPriceCents: 120, validFrom: '2026-09-24', validTo: '2026-09-30', verifiedAt: '2026-09-24T05:00:00Z' })],
    });
    const romandie = resolveLine(line(), flour, profile('coop', 'coop-romandie'), index, ctx());
    expect(romandie.option?.totalCents).toBe(120);
    expect(romandie.option?.statusReasons).toContain('zone_price');
    expect(romandie.option?.statusReasons).toContain('regular_price_unknown');
    // Hors de la zone (ou sans zone connue) : jamais généralisée.
    expect(resolveLine(line(), flour, profile('coop', 'coop-ailleurs'), index, ctx()).option).toBeNull();
    expect(resolveLine(line(), flour, profile('coop'), index, ctx()).option).toBeNull();
  });

  it('marque « indicatif » un prix vérifié il y a 8 à 30 jours', () => {
    const index = buildOfferIndex({
      products: [product('o-flour', 'ottos', 1000)],
      matches: [match(flour.id, 'o-flour')],
      prices: [price('o-flour', 150, '2026-09-10T08:00:00Z')],
      promotions: [],
    });
    const out = resolveLine(line(), flour, profile('ottos'), index, ctx());
    expect(out.option?.status).toBe('indicative');
    expect(out.option?.statusReasons).toContain('aging_price');
  });

  it('applique la priorité succursale > zone > national', () => {
    const index = buildOfferIndex({
      products: [product('m-flour', 'migros', 1000)],
      matches: [match(flour.id, 'm-flour')],
      prices: [
        price('m-flour', 200),
        price('m-flour', 210, undefined, { zoneId: 'migros-zh' }),
        price('m-flour', 230, undefined, { zoneId: 'migros-zh', storeId: 'store-hb' }),
      ],
      promotions: [],
    });
    expect(resolveLine(line(), flour, profile('migros'), index, ctx()).option?.totalCents).toBe(200);
    expect(resolveLine(line(), flour, profile('migros', 'migros-zh'), index, ctx()).option?.totalCents).toBe(210);
    expect(resolveLine(line(), flour, profile('migros', 'migros-zh', 'store-hb'), index, ctx()).option?.totalCents).toBe(230);
  });

  it('respecte les exigences bio / origine suisse / marque', () => {
    const bio = canonical('farine-bio', 1000, 'g', { attributes: { organic: true } });
    const index = buildOfferIndex({
      products: [
        product('m-flour', 'migros', 1000),
        product('m-flour-bio', 'migros', 1000, 'g', { attributes: { organic: true, swissOrigin: true } }),
      ],
      matches: [match(bio.id, 'm-flour'), match(bio.id, 'm-flour-bio'), match(flour.id, 'm-flour'), match(flour.id, 'm-flour-bio')],
      prices: [price('m-flour', 150), price('m-flour-bio', 290)],
      promotions: [],
    });
    const bioLine: BasketLine = { id: 'b', productId: bio.id, qty: 1 };
    expect(resolveLine(bioLine, bio, profile('migros'), index, ctx()).option?.retailerProductId).toBe('m-flour-bio');
    expect(resolveLine(line(), flour, profile('migros'), index, ctx()).option?.retailerProductId).toBe('m-flour');
    expect(resolveLine(line(1, { swissOrigin: true }), flour, profile('migros'), index, ctx()).option?.retailerProductId).toBe('m-flour-bio');

    const nutella = canonical('pate-nutella', 400, 'g', { brandRequired: 'Nutella' });
    const idx2 = buildOfferIndex({
      products: [product('c-copy', 'coop', 400, 'g', { brand: 'Qualité & Prix' })],
      matches: [match(nutella.id, 'c-copy')],
      prices: [price('c-copy', 250)],
      promotions: [],
    });
    const out = resolveLine({ id: 'n', productId: nutella.id, qty: 1 }, nutella, profile('coop'), idx2, ctx());
    expect(out.unavailable?.reason).toBe('filtered_by_preferences');
  });

  it('marque les données de démonstration', () => {
    const index = buildOfferIndex({
      products: [product('x-flour', 'coop', 1000, 'g', { isDemo: true })],
      matches: [match(flour.id, 'x-flour')],
      prices: [price('x-flour', 150, undefined, { isDemo: true })],
      promotions: [],
    });
    const out = resolveLine(line(), flour, profile('coop'), index, ctx());
    expect(out.option?.status).toBe('demo');
    expect(out.option?.isDemo).toBe(true);
  });

  it('ignore une observation postérieure à l’instant de calcul', () => {
    const index = buildOfferIndex({
      products: [product('m-flour', 'migros', 1000)],
      matches: [match(flour.id, 'm-flour')],
      prices: [price('m-flour', 200), price('m-flour', 100, '2026-09-28T08:00:00Z')],
      promotions: [],
    });
    expect(resolveLine(line(), flour, profile('migros'), index, ctx()).option?.totalCents).toBe(200);
  });
});
