import { describe, expect, it } from 'vitest';
import { VARIABLE_WEIGHT_LABEL } from '@cabas/core';
import { buildDennerBatch, contentSizeQuantity, decodeNuxtData, extractDennerGrid, parseDennerItem, parseDennerPeriod } from '../src';

// Pages synthétiques au format de denner.ch (état Nuxt « devalue ») ; valeurs fictives.
function toNuxtData(root: unknown): string {
  const arr: unknown[] = [];
  const add = (v: unknown): number => {
    const i = arr.length;
    arr.push(null);
    if (Array.isArray(v)) arr[i] = v.map(add);
    else if (v && typeof v === 'object') arr[i] = Object.fromEntries(Object.entries(v).map(([k, x]) => [k, add(x)]));
    else arr[i] = v;
    return i;
  };
  add(root);
  // Enveloppe réactive comme sur le site : ["ShallowReactive", index].
  arr.unshift(['ShallowReactive', 1]);
  const shifted = arr.map((v, i) => (i === 0 ? v : shift(v)));
  return `<html><script type="application/json" id="__NUXT_DATA__">${JSON.stringify(shifted)}</script></html>`;
  function shift(v: unknown): unknown {
    if (Array.isArray(v)) return v.map((x) => (typeof x === 'number' ? x + 1 : x));
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, typeof x === 'number' ? x + 1 : x]));
    return v;
  }
}

type Attrs = Record<string, string>;
const item = (sku: string, price: string, attrs: Attrs) => ({
  item: { sku, price, attributeInfo: Object.entries(attrs).map(([attributeName, value]) => ({ attributeName, vals: [{ value, label: value }] })) },
});
const page = (slots: ReturnType<typeof item>[], totalPages = 1) =>
  toNuxtData({ data: { 'prediggoSimplePageContent-1-{}': { blocks: { searches: [{ stats: { totalResults: slots.length, totalPages }, slots }] } } } });

const now = new Date('2026-09-30T08:00:00Z');

describe('Denner : état Nuxt', () => {
  it('décode les références et les enveloppes réactives', () => {
    const html = page([item('a', '1.35', { articleId: '1', name: 'Lait entier UHT Denner', nameSubline: '3,5% de matière grasse, 1,5 litre' })], 3);
    const grid = extractDennerGrid(decodeNuxtData(html));
    expect(grid?.totalPages).toBe(3);
    expect(grid?.items[0]?.attrs.name).toBe('Lait entier UHT Denner');
  });

  it('page sans état : structure modifiée, signalée', () => {
    expect(decodeNuxtData('<html></html>')).toBeNull();
    const b = buildDennerBatch({ pages: [{ url: 'x', html: '<html></html>', fetchedAt: now }] }, { now });
    expect(b.report.metrics?.structureErrors).toBe(1);
  });
});

describe('Denner : articles', () => {
  it('prix permanent, contenance lue dans le détail (« 1,5 litre »), marque propre', () => {
    const r = parseDennerItem({ sku: 'a', price: '1.70', attrs: { articleId: '1004069', name: 'Lait entier UHT Denner', nameSubline: '3,5% de matière grasse, 1,5 litre', itemUrl: '/fr/actions/lait~p1004069?variant=x' } });
    expect('skip' in r).toBe(false);
    if ('skip' in r) return;
    expect(r.product).toMatchObject({ id: 'denner:1004069', quantity: { amount: 1500, unit: 'ml' }, brand: 'Denner', url: 'https://www.denner.ch/fr/actions/lait~p1004069' });
    expect(r.regularCents).toBe(170);
    expect(r.promotion).toBeNull();
  });

  it('action datée avec prix « au lieu de » : jamais lue comme prix permanent', () => {
    const r = parseDennerItem({ sku: 'b', price: '7.75', attrs: { articleId: '1020048', name: 'Lait entier Lovely', nameSubline: 'UHT, 3,5% de matières grasses, 6 x 1 litre', salesQuantity: '6', content_size_text: '1 litre', insteadPriceText: 'au lieu de 11.10', has_discount: 'true', promotionLabel: '24.09–30.09.2026' } });
    if ('skip' in r) throw new Error(r.skip);
    expect(r.product.quantity).toEqual({ amount: 6000, unit: 'ml' });
    expect(r.regularCents).toBeNull();
    expect(r.promotion).toEqual({ promoCents: 775, referenceCents: 1110, from: '2026-09-24', to: '2026-09-30', label: '24.09–30.09.2026' });
  });

  it('écarte lots ambigus, offres conditionnelles, prix nuls et contenances inconnues', () => {
    expect(parseDennerItem({ sku: 'c', price: '7.75', attrs: { articleId: '1', name: 'Lait', nameSubline: 'UHT, 1 litre', salesQuantity: '6' } })).toEqual({ skip: 'lot ambigu' });
    expect(parseDennerItem({ sku: 'd', price: '0', attrs: { articleId: '2', name: 'sur toutes les bières' } })).toEqual({ skip: 'prix nul ou offre générale' });
    expect(parseDennerItem({ sku: 'e', price: '2.00', attrs: { articleId: '3', name: 'Chips', nameSubline: 'paprika', discount_text: '20% dès 2 pièces' } })).toEqual({ skip: 'offre conditionnelle' });
    expect(parseDennerItem({ sku: 'f', price: '2.00', attrs: { articleId: '4', name: 'Divers', nameSubline: 'assortiment' } })).toEqual({ skip: 'contenance inconnue' });
  });

  it('vente au poids, origine suisse, bio et AOP', () => {
    const kg = parseDennerItem({ sku: 'g', price: '2.45', attrs: { articleId: '5', name: 'Pommes de terre IP-SUISSE', nameSubline: 'fermes à la cuisson, le kg' } });
    if ('skip' in kg) throw new Error(kg.skip);
    expect(kg.product.quantity).toEqual({ amount: 1000, unit: 'g' });
    expect(kg.product.attributes).toMatchObject({ swissOrigin: true, labels: [VARIABLE_WEIGHT_LABEL] });
    const aop = parseDennerItem({ sku: 'h', price: '4.95', attrs: { articleId: '6', name: 'Gruyère AOP doux bio', nameSubline: 'Suisse, 250 g' } });
    if ('skip' in aop) throw new Error(aop.skip);
    expect(aop.product.attributes).toMatchObject({ organic: true, swissOrigin: true, labels: ['aop'] });
  });

  it('œufs comptés en pièces, origine lue ; fromages AOP suisses', () => {
    const plein = parseDennerItem({ sku: 'i', price: '3.30', attrs: { articleId: '7', name: "IP-Suisse Oeufs d'élevage en plein air", nameSubline: '6 x 53+ g' } });
    if ('skip' in plein) throw new Error(plein.skip);
    expect(plein.product.quantity).toEqual({ amount: 6, unit: 'piece' });
    expect(plein.product.attributes.swissOrigin).toBe(true);
    const importes = parseDennerItem({ sku: 'j', price: '2.70', attrs: { articleId: '8', name: 'Œufs Denner', nameSubline: "d'élevage au sol, importés, 12" } });
    if ('skip' in importes) throw new Error(importes.skip);
    expect(importes.product.quantity).toEqual({ amount: 12, unit: 'piece' });
    expect(importes.product.attributes.swissOrigin).toBe(false);
    const gruyere = parseDennerItem({ sku: 'k', price: '4.95', attrs: { articleId: '9', name: 'Le Gruyère AOP', nameSubline: 'affiné en grotte, 200 g' } });
    if ('skip' in gruyere) throw new Error(gruyere.skip);
    expect(gruyere.product.attributes).toMatchObject({ swissOrigin: true, labels: ['aop'] });
    expect(parseDennerItem({ sku: 'l', price: '5.95', attrs: { articleId: '10', name: 'Œufs avec liqueur aux œufs Lindt', nameSubline: '108 g' } })).not.toHaveProperty('skip');
  });

  it('dates publiées et contenances « unit. »', () => {
    expect(parseDennerPeriod('24.09–30.09.2026')).toEqual({ from: '2026-09-24', to: '2026-09-30' });
    expect(parseDennerPeriod("Jusqu'au 30.09.2026")).toEqual({ from: null, to: '2026-09-30' });
    expect(parseDennerPeriod('Dès le 01.10.2026')).toEqual({ from: '2026-10-01', to: null });
    expect(parseDennerPeriod('Depuis le 11.06.2026')).toEqual({ from: null, to: null });
    expect(contentSizeQuantity('0.5 unit.ml')).toEqual({ amount: 500, unit: 'ml' });
    expect(contentSizeQuantity('0.6 unit.g')).toEqual({ amount: 600, unit: 'g' });
    expect(contentSizeQuantity('1 unit.kg')).toEqual({ amount: 1000, unit: 'g' });
  });
});

describe('Denner : lot', () => {
  it('prix permanents et actions séparés, actions expirées exclues, fin non publiée signalée', () => {
    const html = page([
      item('a', '1.70', { articleId: '10', name: 'Lait entier UHT Denner', nameSubline: '1,5 litre' }),
      item('b', '2.99', { articleId: '11', name: 'Pommes de terre IP-SUISSE', nameSubline: 'fermes à la cuisson, 2,5 kg', insteadPriceText: 'au lieu de 3.75', promotionLabel: '24.09–30.09.2026' }),
      item('c', '1.00', { articleId: '12', name: 'Farine', nameSubline: '1 kg', insteadPriceText: 'au lieu de 1.20', promotionLabel: '17.09–23.09.2026' }),
      item('d', '3.00', { articleId: '13', name: 'Café', nameSubline: '500 g', insteadPriceText: 'au lieu de 4.00', has_discount: 'true' }),
    ]);
    const b = buildDennerBatch({ pages: [{ url: 'https://www.denner.ch/fr/search?q=x', html, fetchedAt: now, query: 'x' }] }, { now });
    expect(b.prices.map((p) => [p.retailerProductId, p.priceCents, p.priceType, p.reliability])).toEqual([['denner:10', 170, 'regular', 'official']]);
    expect(b.promotions.map((p) => [p.retailerProductId, p.validFrom, p.validTo, p.endIsPresumed])).toEqual([
      ['denner:11', '2026-09-24', '2026-09-30', false],
      ['denner:13', '2026-09-30', '2026-09-30', true],
    ]);
    expect(b.report.metrics?.['skipped: action expirée']).toBe(1);
    expect(b.prices[0]?.sourceUrl).toMatch(/^https:\/\/www\.denner\.ch\//);
  });
});
