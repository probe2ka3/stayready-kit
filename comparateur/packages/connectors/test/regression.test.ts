import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  checkCollection,
  DEFAULT_FRESHNESS,
  validateAgainstDataset,
  type DataSet,
  type ValidationDataset,
} from '@cabas/core';
import { PRODUCTS } from '@cabas/reference';
import { aldiSearchUrl, buildAldiBatch, buildLidlBatch, readLiveDataSet, type AldiApiItem } from '../src';

/**
 * Tests de non-régression de la collecte (jeu de validation des essentiels) : disparition d'un
 * catalogue, changement de structure, prix manquants, quantité mal lue, action lue comme prix
 * normal, prix d'un lot attribué à une unité.
 */

const NOW = new Date('2026-09-28T06:00:00Z');
const dataDir = join(__dirname, '..', '..', '..', 'data');

const water = (sellingSize: string, cents: number, extra: Partial<AldiApiItem> = {}): AldiApiItem => ({
  sku: '000000000000581120',
  name: 'Eau minérale suisse, plate',
  brandName: 'SAVEURS SUISSES',
  urlSlugText: 'eau-minerale',
  sellingSize,
  price: { amount: cents, amountRelevant: cents, comparisonDisplay: null },
  categories: [{ id: '1588161418433035', name: 'Boissons non alcoolisées' }],
  ...extra,
});

function aldiData(items: AldiApiItem[]): DataSet {
  const b = buildAldiBatch({ pages: [{ url: aldiSearchUrl(0), json: { meta: { pagination: { totalCount: items.length } }, data: items }, fetchedAt: NOW }] }, { now: NOW });
  return { products: b.retailerProducts, matches: [], prices: b.prices, promotions: b.promotions };
}

const dataset: ValidationDataset = {
  description: 'test',
  version: '1',
  calibratedAt: NOW.toISOString(),
  chains: ['aldi'],
  entries: [
    {
      slug: 'eau-plate-6x1500ml',
      name: 'Eau minérale plate (6 × 1,5 l)',
      query: { de: 'Mineralwasser', fr: 'eau plate' },
      unit: 'ml',
      amount: { min: 1500, max: 45000 },
      unitCents: { min: 10, max: 150 },
      chains: { aldi: { status: 'covered', retailerProductIds: ['aldi:581120'] } },
    },
  ],
};

describe('non-régression de la collecte', () => {
  it('cas nominal : article attendu, contenance et prix plausibles', () => {
    const r = validateAgainstDataset(dataset, aldiData([water('1,5 l', 65)]), NOW, DEFAULT_FRESHNESS);
    expect(r).toMatchObject({ checked: 1, passed: 1, failures: [] });
  });

  it('disparition du catalogue : enseigne vide ou article attendu absent', () => {
    const empty = validateAgainstDataset(dataset, { products: [], matches: [], prices: [], promotions: [] }, NOW, DEFAULT_FRESHNESS);
    expect(empty.failures.map((f) => f.kind)).toEqual(['catalog_empty', 'product_disappeared']);
    const other = validateAgainstDataset(dataset, aldiData([water('1,5 l', 65, { sku: '000000000000999999' })]), NOW, DEFAULT_FRESHNESS);
    expect(other.failures[0]?.kind).toBe('product_disappeared');
  });

  it('changement de structure : aucune donnée extraite → alerte parse_drift', () => {
    const lidl = buildLidlBatch({ assortment: [{ url: 'https://sortiment.lidl.ch/fr/x', html: '<div class="new-layout">…</div>', fetchedAt: NOW }], offers: [] }, { now: NOW });
    expect(checkCollection({ connectorId: 'lidl-web', products: lidl.retailerProducts.length, prices: 0, promotions: 0 }, null)[0]?.kind).toBe('parse_drift');
    const aldi = buildAldiBatch({ pages: [{ url: aldiSearchUrl(0), json: { items: [] } as never, fetchedAt: NOW }] }, { now: NOW });
    expect(aldi.retailerProducts).toHaveLength(0);
    expect(checkCollection({ connectorId: 'aldi-api', products: 0, prices: 0, promotions: 0 }, { connectorId: 'aldi-api', products: 1800, prices: 1400, promotions: 500 }).map((a) => a.kind)).toEqual(['parse_drift', 'coverage_drop']);
  });

  it('prix manquant : article présent sans prix utilisable', () => {
    const d = aldiData([water('1,5 l', 65)]);
    d.prices = [];
    expect(validateAgainstDataset(dataset, d, NOW, DEFAULT_FRESHNESS).failures[0]?.kind).toBe('missing_price');
    // Prix trop ancien : inutilisable, même signal.
    const old = aldiData([water('1,5 l', 65)]);
    old.prices = old.prices.map((o) => ({ ...o, observedAt: '2026-07-01T06:00:00Z' }));
    expect(validateAgainstDataset(dataset, old, NOW, DEFAULT_FRESHNESS).failures[0]?.kind).toBe('missing_price');
  });

  it('quantité mal lue : contenance hors bornes', () => {
    // « 150 cl » lu « 150 ml » par une source défaillante.
    const r = validateAgainstDataset(dataset, aldiData([water('150 ml', 65)]), NOW, DEFAULT_FRESHNESS);
    expect(r.failures[0]?.kind).toBe('quantity_out_of_range');
  });

  it('prix d’un lot attribué à une unité : prix au litre hors bornes', () => {
    // Pack de 6 bouteilles (CHF 3.90) enregistré avec la contenance d'une bouteille.
    const r = validateAgainstDataset(dataset, aldiData([water('1,5 l', 390)]), NOW, DEFAULT_FRESHNESS);
    expect(r.failures[0]?.kind).toBe('unit_price_out_of_range');
    // Le connecteur, lui, lit correctement un lot publié « 6 x 1,5 l ».
    const ok = aldiData([water('6 x 1,5 l', 390)]);
    expect(ok.products[0]?.quantity).toEqual({ amount: 9000, unit: 'ml' });
    expect(validateAgainstDataset(dataset, ok, NOW, DEFAULT_FRESHNESS).passed).toBe(1);
  });

  it('action lue comme prix normal : détectée', () => {
    const d = aldiData([water('1,5 l', 50)]);
    d.promotions.push({
      id: 'x',
      retailerProductId: 'aldi:581120',
      chainId: 'aldi',
      zoneId: null,
      storeId: null,
      type: 'price',
      promoPriceCents: 50,
      referencePriceCents: 65,
      whileStocksLast: true,
      publishedAt: NOW.toISOString(),
      validFrom: '2026-09-28',
      validTo: '2026-10-03',
      source: { connectorId: 'aldi-api', kind: 'retailer_site' },
      verifiedAt: NOW.toISOString(),
      isDemo: false,
    });
    expect(validateAgainstDataset(dataset, d, NOW, DEFAULT_FRESHNESS).failures[0]?.kind).toBe('promo_as_regular');
    // Le connecteur n'enregistre jamais le prix réduit comme prix normal.
    const promo = aldiData([water('1,5 l', 50, { price: { amount: 50, amountRelevant: 50, wasPriceDisplay: 'CHF 0.65' } })]);
    expect(promo.prices.map((o) => o.priceCents)).toEqual([65]);
    expect(promo.promotions[0]?.promoPriceCents).toBe(50);
  });
});

describe.skipIf(!existsSync(join(dataDir, 'validation', 'essentials.json')))('jeu de validation sur les instantanés versionnés', () => {
  it('au moins 90 % des paires attendues restent valides', async () => {
    const ds = JSON.parse(readFileSync(join(dataDir, 'validation', 'essentials.json'), 'utf8')) as ValidationDataset;
    const { data } = await readLiveDataSet(dataDir, PRODUCTS);
    // Date de référence : calibrage du jeu (les instantanés versionnés vieillissent ensuite).
    const r = validateAgainstDataset(ds, data, new Date(ds.calibratedAt), DEFAULT_FRESHNESS);
    expect(ds.entries).toHaveLength(50);
    expect(r.checked).toBeGreaterThan(0);
    expect(r.passed / r.checked).toBeGreaterThanOrEqual(0.9);
  });
});
