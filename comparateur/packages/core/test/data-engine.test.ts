import { describe, expect, it } from 'vitest';
import {
  buildPriceRecords,
  confidenceOf,
  coverageKpis,
  dataQualityReport,
  DEFAULT_FRESHNESS,
  resolveLine,
  sourceInfo,
  type BasketLine,
  type DataSet,
  type DataSource,
} from '../src';
import { buildOfferIndex, canonical, ctx, match, NOW, price, product, profile, promo } from './fixtures';

const LIDL: DataSource = { connectorId: 'lidl-web', kind: 'retailer_site' };
const OP: DataSource = { connectorId: 'open-prices', kind: 'open_data' };
const FA: DataSource = { connectorId: 'foodally', kind: 'third_party' };

const penne = canonical('penne-500g', 500);
const line: BasketLine = { id: 'l1', productId: penne.id, qty: 1 };

describe('hiérarchie des sources', () => {
  it('qualifie chaque source : officielle, tiers, communautaire, inconnue', () => {
    expect(sourceInfo(LIDL).tier).toBe('first_party');
    expect(sourceInfo({ connectorId: 'aldi-api', kind: 'retailer_site' })).toMatchObject({ tier: 'first_party', collectionMethod: 'public_api' });
    expect(sourceInfo(FA)).toMatchObject({ tier: 'licensed', benchmarkOnly: true });
    expect(sourceInfo(OP).tier).toBe('community');
    expect(sourceInfo({ connectorId: 'x', kind: 'demo' }).tier).toBe('unknown');
  });

  it('préfère la source officielle même si un relevé communautaire est moins cher, et le signale', () => {
    const index = buildOfferIndex({
      products: [
        product('lidl:1', 'lidl', 500, 'g', { name: 'Penne rigate' }),
        product('lidl:gtin-1', 'lidl', 500, 'g', { name: 'Penne rigate', connectorId: 'open-prices' }),
      ],
      matches: [match(penne.id, 'lidl:1'), match(penne.id, 'lidl:gtin-1')],
      prices: [price('lidl:1', 95, '2026-09-27T06:00:00Z', { source: LIDL }), price('lidl:gtin-1', 65, '2026-09-20T06:00:00Z', { source: OP })],
      promotions: [],
    });
    const opt = resolveLine(line, penne, profile('lidl'), index, ctx()).option!;
    expect(opt.totalCents).toBe(95);
    expect(opt.sourceTier).toBe('first_party');
    expect(opt.alternatives).toHaveLength(1);
    expect(opt.alternatives[0]).toMatchObject({ connectorId: 'open-prices', tier: 'community', totalCents: 65 });
    expect(opt.divergence?.relativeGap).toBeCloseTo(0.316, 2);
    expect(opt.statusReasons).toContain('source_divergence');
  });

  it('ne signale pas de divergence entre deux articles différents (marques différentes)', () => {
    const index = buildOfferIndex({
      products: [
        product('lidl:1', 'lidl', 500, 'g', { name: 'Penne rigate', brand: 'Combino' }),
        product('lidl:gtin-2', 'lidl', 500, 'g', { name: 'Penne rigate', brand: 'Barilla', connectorId: 'open-prices' }),
      ],
      matches: [match(penne.id, 'lidl:1'), match(penne.id, 'lidl:gtin-2')],
      prices: [price('lidl:1', 95, '2026-09-27T06:00:00Z', { source: LIDL }), price('lidl:gtin-2', 249, '2026-09-20T06:00:00Z', { source: OP })],
      promotions: [],
    });
    const opt = resolveLine(line, penne, profile('lidl'), index, ctx()).option!;
    expect(opt.divergence).toBeNull();
    expect(opt.alternatives).toHaveLength(1);
  });

  it('se replie sur une source de niveau inférieur si aucune source officielle n’est utilisable', () => {
    const index = buildOfferIndex({
      products: [product('coop:gtin-3', 'coop', 500, 'g', { name: 'Penne' })],
      matches: [match(penne.id, 'coop:gtin-3')],
      prices: [price('coop:gtin-3', 180, '2026-09-10T06:00:00Z', { source: OP })],
      promotions: [],
    });
    const opt = resolveLine(line, penne, profile('coop'), index, ctx()).option!;
    expect(opt).toMatchObject({ sourceTier: 'community', status: 'indicative' });
    expect(opt.statusReasons).toEqual(expect.arrayContaining(['crowd_sourced', 'fallback_source']));
  });

  it('exclut les sources de comparaison (FoodAlly) des prix affichés, sauf activation explicite', () => {
    const input = {
      products: [product('coop:fa-1', 'coop', 500, 'g', { name: 'Penne', connectorId: 'foodally' })],
      matches: [match(penne.id, 'coop:fa-1')],
      prices: [price('coop:fa-1', 175, '2026-09-27T06:00:00Z', { source: FA })],
      promotions: [],
    };
    expect(resolveLine(line, penne, profile('coop'), buildOfferIndex(input), ctx()).option).toBeNull();
    const opt = resolveLine(line, penne, profile('coop'), buildOfferIndex(input, { allowBenchmarkSources: true }), ctx()).option!;
    expect(opt).toMatchObject({ sourceTier: 'licensed', reliability: 'third_party', status: 'indicative' });
    expect(opt.statusReasons).toContain('third_party_source');
  });

  it('calcule un indice de confiance selon la source, la fraîcheur et la correspondance', () => {
    expect(confidenceOf({ observedAt: '2026-09-27T06:00:00Z', source: LIDL }, NOW, DEFAULT_FRESHNESS)).toBe(0.95);
    expect(confidenceOf({ observedAt: '2026-09-27T06:00:00Z', source: LIDL }, NOW, DEFAULT_FRESHNESS, 'similar')).toBe(0.81);
    expect(confidenceOf({ observedAt: '2026-09-27T06:00:00Z', source: OP }, NOW, DEFAULT_FRESHNESS)).toBe(0.6);
    expect(confidenceOf({ observedAt: '2026-01-01T06:00:00Z', source: OP }, NOW, DEFAULT_FRESHNESS)).toBe(0.15);
  });
});

function dataset(): DataSet {
  return {
    products: [
      product('lidl:1', 'lidl', 500, 'g', { name: 'Penne rigate', connectorId: 'lidl-web' }),
      product('aldi:1', 'aldi', 1000, 'g', { name: 'Penne rigate', connectorId: 'aldi-api' }),
      product('coop:gtin-1', 'coop', 500, 'g', { name: 'Penne rigate', connectorId: 'open-prices' }),
      product('migros:gtin-1', 'migros', 500, 'g', { name: 'Penne rigate', connectorId: 'open-prices' }),
      product('aldi:2', 'aldi', 1500, 'ml', { name: 'Eau minérale 6 x 1,5 l', connectorId: 'aldi-api' }),
    ],
    matches: [match(penne.id, 'lidl:1'), match(penne.id, 'aldi:1', 'similar'), match(penne.id, 'coop:gtin-1'), match(penne.id, 'migros:gtin-1')],
    prices: [
      price('lidl:1', 95, '2026-09-27T06:00:00Z', { source: LIDL }),
      price('aldi:1', 119, '2026-09-26T06:00:00Z', { source: { connectorId: 'aldi-api', kind: 'retailer_site' } }),
      price('coop:gtin-1', 190, '2026-09-01T06:00:00Z', { source: OP }),
      price('migros:gtin-1', 185, '2026-03-01T06:00:00Z', { source: OP }),
    ],
    promotions: [],
  };
}

describe('couverture et fraîcheur', () => {
  it('compte les références comparables par nombre d’enseignes et la fraîcheur des prix', () => {
    const k = coverageKpis(dataset(), [penne, canonical('riz-1kg', 1000)], ['lidl', 'aldi', 'coop', 'migros'], NOW, DEFAULT_FRESHNESS);
    expect(k.catalogSize).toBe(2);
    expect(k.comparable).toEqual({ '2': 1, '3': 1, '4': 0, '5': 0 });
    const lidl = k.chains.find((c) => c.chainId === 'lidl')!;
    expect(lidl).toMatchObject({ references: 1, referencesFirstParty: 1, fresh24h: 1 });
    const coop = k.chains.find((c) => c.chainId === 'coop')!;
    expect(coop).toMatchObject({ references: 1, referencesFirstParty: 0, older: 1 });
    // Migros : relevé de plus de 90 jours, inutilisable.
    expect(k.chains.find((c) => c.chainId === 'migros')!.references).toBe(0);
    expect(k.byReference).toEqual([{ canonicalId: 'penne-500g', chains: ['aldi', 'coop', 'lidl'] }]);
  });

  it('produit des observations enrichies avec provenance complète', () => {
    const recs = buildPriceRecords(dataset(), NOW, DEFAULT_FRESHNESS);
    const lidl = recs.find((r) => r.retailerProductId === 'lidl:1')!;
    expect(lidl).toMatchObject({
      productId: 'penne-500g',
      retailer: 'lidl',
      geographicScope: 'national',
      price: 95,
      regularPrice: 95,
      promotionalPrice: null,
      currency: 'CHF',
      quantity: 500,
      unit: 'g',
      sourceType: 'first_party',
      sourceProvider: 'Lidl Suisse (site officiel)',
      collectionMethod: 'public_web_page',
      // 0,95 (source officielle) × 0,95 (correspondance « équivalent »).
      confidence: 0.9,
    });
    expect(lidl.unitPrice).toEqual({ basis: 'kg', cents: 190 });
  });
});

describe('contrôle de qualité', () => {
  const report = (data: DataSet, connectors = [] as Parameters<typeof dataQualityReport>[2]) =>
    dataQualityReport(data, [penne, canonical('eau-6x1500ml', 9000, 'ml')], connectors, NOW, DEFAULT_FRESHNESS);

  it('ne signale rien sur un jeu de données cohérent (hors prix ancien)', () => {
    const r = report(dataset());
    expect(r.counts).toMatchObject({ suspicious_price: 0, duplicate: 0, abnormal_change: 0, source_divergence: 0, promo_as_regular: 0 });
    expect(r.counts.stale_data).toBe(1);
  });

  it('détecte doublons, variations brutales et prix hors bornes', () => {
    const d = dataset();
    d.prices.push(price('lidl:1', 99, '2026-09-27T07:00:00Z', { source: LIDL }));
    d.prices.push(price('aldi:1', 250, '2026-09-27T06:00:00Z', { source: { connectorId: 'aldi-api', kind: 'retailer_site' } }));
    d.prices.push(price('coop:gtin-1', 2, '2026-09-27T06:00:00Z', { source: OP }));
    const r = report(d);
    expect(r.counts.duplicate).toBe(1);
    expect(r.counts.abnormal_change).toBeGreaterThanOrEqual(1);
    expect(r.issues.some((i) => i.kind === 'suspicious_price' && /hors bornes/.test(i.message))).toBe(true);
  });

  it('détecte une action enregistrée comme prix normal', () => {
    const d = dataset();
    d.prices.push(price('lidl:1', 79, '2026-09-27T09:00:00Z', { source: LIDL }));
    d.promotions.push(promo('lidl:1', 'lidl', { promoPriceCents: 79, referencePriceCents: 95, source: LIDL }));
    expect(report(d).counts.promo_as_regular).toBe(1);
  });

  it('détecte un lot enregistré avec la contenance d’une unité', () => {
    expect(report(dataset()).issues.some((i) => i.kind === 'inconsistent_quantity' && i.entityId === 'aldi:2')).toBe(true);
  });

  it('détecte une divergence entre deux sources pour le même article', () => {
    const d = dataset();
    d.products.push(product('lidl:gtin-9', 'lidl', 500, 'g', { name: 'Penne rigate', connectorId: 'open-prices' }));
    d.matches.push(match(penne.id, 'lidl:gtin-9'));
    d.prices.push(price('lidl:gtin-9', 145, '2026-09-20T06:00:00Z', { source: OP }));
    const r = report(d);
    expect(r.counts.source_divergence).toBe(1);
    expect(r.issues.find((i) => i.kind === 'source_divergence')?.message).toMatch(/lidl-web CHF 0.95 contre open-prices CHF 1.45|open-prices CHF 1.45 contre lidl-web CHF 0.95/);
  });

  it('signale un connecteur bloqué, en échec ou sans collecte récente', () => {
    const r = report(dataset(), [
      { connectorId: 'coop-web', status: 'blocked', collectedAt: '2026-09-27T05:00:00Z' },
      { connectorId: 'lidl-web', status: 'success', collectedAt: '2026-09-20T05:00:00Z' },
      { connectorId: 'aldi-api', status: 'success', collectedAt: '2026-09-27T05:00:00Z' },
    ]);
    expect(r.counts.connector_broken).toBe(2);
    expect(r.issues.find((i) => i.entityId === 'coop-web')?.severity).toBe('error');
  });
});

describe('contrôle de collecte par rotation', () => {
  it('compare le rendement par page quand les pages sont connues (pas de fausse alerte)', async () => {
    const { checkCollection } = await import('../src');
    const full = { connectorId: 'lidl-web', products: 3547, prices: 3004, promotions: 660, pages: 3284 };
    const rotation = { connectorId: 'lidl-web', products: 1624, prices: 1208, promotions: 531, pages: 526 };
    expect(checkCollection(rotation, full)).toEqual([]);
    const broken = { ...rotation, prices: 100, promotions: 20 };
    expect(checkCollection(broken, full).map((a) => a.kind)).toEqual(['coverage_drop']);
  });
});
