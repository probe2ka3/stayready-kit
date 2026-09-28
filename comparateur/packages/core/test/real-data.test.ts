import { describe, expect, it } from 'vitest';
import { resolveLine, type BasketLine } from '../src';
import { buildOfferIndex, canonical, ctx, match, price, product, profile, promo } from './fixtures';

/**
 * Cas propres aux données réelles (phase 2) : relevés communautaires, actions régionales,
 * prix conditionnels, prix anciens et dates futures.
 */
const quark = canonical('sere-500g', 500);
const line = (qty = 1): BasketLine => ({ id: 'l1', productId: quark.id, qty });

describe('données réelles', () => {
  it('ne présente jamais un relevé communautaire comme « vérifié », et affiche lieu et licence', () => {
    const index = buildOfferIndex({
      products: [product('m-q', 'migros', 500)],
      matches: [match(quark.id, 'm-q')],
      prices: [
        price('m-q', 125, '2026-09-25T10:00:00Z', {
          source: { connectorId: 'open-prices', kind: 'open_data', ref: 'open-prices:1' },
          reliability: 'crowd',
          license: 'ODbL-1.0',
          observedAtPlace: 'Migros, Murten',
          zoneId: 'migros-nf',
        }),
      ],
      promotions: [],
    });
    const out = resolveLine(line(), quark, profile('migros', 'migros-nf'), index, ctx());
    expect(out.option?.status).toBe('indicative');
    expect(out.option?.statusReasons).toContain('crowd_sourced');
    expect(out.option).toMatchObject({ reliability: 'crowd', license: 'ODbL-1.0', observedAtPlace: 'Migros, Murten' });
    // Le relevé de la zone Neuchâtel-Fribourg ne s'applique pas à une autre coopérative.
    expect(resolveLine(line(), quark, profile('migros', 'migros-vaud'), index, ctx()).option).toBeNull();
  });

  it('garde un relevé communautaire jusqu’à 90 jours, puis l’exclut par défaut', () => {
    const crowd = (at: string) =>
      buildOfferIndex({
        products: [product('c-q', 'coop', 500)],
        matches: [match(quark.id, 'c-q')],
        prices: [price('c-q', 130, at, { source: { connectorId: 'open-prices', kind: 'open_data' } })],
        promotions: [],
      });
    expect(resolveLine(line(), quark, profile('coop'), crowd('2026-07-15T10:00:00Z'), ctx()).option?.status).toBe('indicative');
    const old = resolveLine(line(), quark, profile('coop'), crowd('2026-05-01T10:00:00Z'), ctx());
    expect(old.option).toBeNull();
    expect(old.unavailable?.reason).toBe('stale_price_excluded');
    // Inclus sur demande, il reste « périmé », même pour une date future.
    const future = ctx({ targetDate: '2026-10-02', prefs: { ...ctx().prefs, includeStalePrices: true } });
    expect(resolveLine(line(), quark, profile('coop'), crowd('2026-05-01T10:00:00Z'), future).option?.status).toBe('stale');
  });

  it('limite une action régionale à sa région (ex. Lidl Tessin)', () => {
    const index = buildOfferIndex({
      products: [product('l-q', 'lidl', 500)],
      matches: [match(quark.id, 'l-q')],
      prices: [price('l-q', 125, '2026-09-27T06:00:00Z', { source: { connectorId: 'lidl-web', kind: 'retailer_site' } })],
      promotions: [promo('l-q', 'lidl', { type: 'price', promoPriceCents: 99, zoneId: 'lidl-ticino', regionNote: 'valable uniquement au Tessin' })],
    });
    expect(resolveLine(line(), quark, profile('lidl', 'lidl-ticino'), index, ctx()).option?.totalCents).toBe(99);
    const romandie = resolveLine(line(), quark, profile('lidl', 'lidl-romandie'), index, ctx()).option;
    expect(romandie?.totalCents).toBe(125);
    expect(romandie?.status).toBe('verified');
  });

  it('applique un prix conditionnel « dès 2 pièces » seulement à partir de la quantité requise', () => {
    const index = buildOfferIndex({
      products: [product('d-q', 'denner', 500)],
      matches: [match(quark.id, 'd-q')],
      prices: [price('d-q', 150)],
      promotions: [promo('d-q', 'denner', { type: 'min_qty_price', promoPriceCents: 110, minQty: 2 })],
    });
    expect(resolveLine(line(1), quark, profile('denner'), index, ctx()).option?.totalCents).toBe(150);
    const two = resolveLine(line(2), quark, profile('denner'), index, ctx()).option;
    expect(two?.totalCents).toBe(220);
    expect(two?.status).toBe('promo_confirmed');
  });

  it('utilise une action publiée à l’avance pour une date future, jamais avant sa publication', () => {
    const future = promo('l-q', 'lidl', {
      type: 'price',
      promoPriceCents: 99,
      publishedAt: '2026-09-26T22:00:00Z',
      validFrom: '2026-10-01',
      validTo: '2026-10-07',
    });
    const index = buildOfferIndex({
      products: [product('l-q', 'lidl', 500)],
      matches: [match(quark.id, 'l-q')],
      prices: [price('l-q', 125)],
      promotions: [future],
    });
    expect(resolveLine(line(), quark, profile('lidl'), index, ctx({ targetDate: '2026-10-02' })).option?.totalCents).toBe(99);
    // Même promotion, calcul fait avant sa publication : ignorée.
    const before = ctx({ asOf: new Date('2026-09-26T12:00:00Z'), today: '2026-09-26', targetDate: '2026-10-02' });
    const out = resolveLine(line(), quark, profile('lidl'), index, before).option;
    expect(out?.totalCents).toBe(125);
    expect(out?.status).toBe('indicative');
  });

  it('n’utilise pas une correspondance seulement suggérée', () => {
    const index = buildOfferIndex({
      products: [product('a-q', 'aldi', 500)],
      matches: [{ ...match(quark.id, 'a-q'), status: 'suggested' }],
      prices: [price('a-q', 100)],
      promotions: [],
    });
    expect(resolveLine(line(), quark, profile('aldi'), index, ctx()).unavailable?.reason).toBe('no_match');
  });
});
