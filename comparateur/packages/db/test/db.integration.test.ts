import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import postgres from 'postgres';
import { compareBasket, DEFAULT_PREFS, DEFAULT_TRAVEL, withCrowDistance, type Store } from '@cabas/core';
import { generateDemoData, parseImportFile } from '@cabas/connectors';
import { CATEGORIES, CHAINS, PRICE_ZONES, PRODUCTS } from '@cabas/reference';
import {
  applyBatch,
  chainDataStatus,
  createDb,
  findStoresNear,
  listAnomalies,
  listCanonicalProducts,
  listChains,
  listMatches,
  loadOfferIndex,
  replaceLocalities,
  resolveAnomaly,
  reviewMatch,
  runMigrations,
  runQualityChecks,
  searchLocalities,
  syncReference,
  upsertStores,
  type DbHandle,
} from '../src';

const URL = process.env.DATABASE_URL_TEST ?? 'postgres://cabas:cabas_dev_only@localhost:5432/cabas_test';
const NOW = new Date('2026-09-27T10:00:00Z');
const BULLE = { lat: 46.6192, lon: 7.0567 };

async function reachable(): Promise<boolean> {
  const c = postgres(URL, { max: 1, connect_timeout: 3, onnotice: () => {} });
  try {
    await c`SELECT 1`;
    return true;
  } catch {
    return false;
  } finally {
    await c.end({ timeout: 1 });
  }
}

const available = await reachable();

const store = (id: string, chainId: string, lat: number, lon: number, extra: Partial<Store> = {}): Store => ({
  id,
  chainId,
  name: `${chainId} ${id}`,
  lat,
  lon,
  canton: 'FR',
  zoneId: chainId === 'migros' ? 'migros-nf' : null,
  openingHours: 'Mo-Sa 08:00-19:00; Su off; PH off',
  source: { connectorId: 'osm', kind: 'open_data', ref: 'test' },
  ...extra,
});

describe.skipIf(!available)('base PostgreSQL + PostGIS', () => {
  let h: DbHandle;

  beforeAll(async () => {
    const admin = postgres(URL, { max: 1, onnotice: () => {} });
    await admin.unsafe('DROP SCHEMA IF EXISTS drizzle CASCADE; DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;');
    await admin.end();
    await runMigrations(URL);
    await runMigrations(URL); // idempotent
    h = createDb(URL, { max: 3 });
    await syncReference(h.db, { chains: CHAINS, zones: PRICE_ZONES, categories: CATEGORIES, products: PRODUCTS });
    await replaceLocalities(h, [
      { zip: '1630', suffix: '00', name: 'Bulle', municipality: 'Bulle', canton: 'FR', lat: 46.6192, lon: 7.0567, lang: 'fr' },
      { zip: '1700', suffix: '00', name: 'Fribourg', municipality: 'Fribourg', canton: 'FR', lat: 46.8065, lon: 7.1619, lang: 'fr' },
      { zip: '1003', suffix: '00', name: 'Lausanne', municipality: 'Lausanne', canton: 'VD', lat: 46.5206, lon: 6.6318, lang: 'fr' },
      { zip: '8001', suffix: '00', name: 'Zürich', municipality: 'Zürich', canton: 'ZH', lat: 47.3717, lon: 8.5423, lang: 'de' },
    ]);
    await upsertStores(h, 'osm', [
      store('m1', 'migros', 46.6205, 7.0551),
      store('c1', 'coop', 46.6165, 7.0602),
      store('d1', 'denner', 46.6250, 7.0500),
      store('a1', 'aldi', 46.6400, 7.0700),
      store('l1', 'lidl', 46.6000, 7.0300),
      store('far', 'coop', 46.8065, 7.1619), // Fribourg, ~23 km
    ]);
    await applyBatch(h, generateDemoData(NOW).batch, null);
  });

  afterAll(async () => {
    await h?.close();
  });

  it('trouve les succursales dans un rayon (PostGIS) et filtre par enseigne', async () => {
    const near = await findStoresNear(h, BULLE, 5);
    expect(near.map((s) => s.id)).not.toContain('far');
    expect(near[0]?.crowKm).toBeLessThan(near[near.length - 1]?.crowKm as number);
    const wide = await findStoresNear(h, BULLE, 30);
    expect(wide.map((s) => s.id)).toContain('far');
    const onlyCoop = await findStoresNear(h, BULLE, 30, ['coop']);
    expect(onlyCoop.every((s) => s.chainId === 'coop')).toBe(true);
  });

  it('désactive les succursales disparues de la source', async () => {
    const res = await upsertStores(h, 'test-source', [store('tmp1', 'lidl', 46.62, 7.05, { source: { connectorId: 'test-source', kind: 'open_data' } })]);
    expect(res.upserted).toBe(1);
    const res2 = await upsertStores(h, 'test-source', []);
    expect(res2.deactivated).toBe(1);
    expect((await findStoresNear(h, BULLE, 5)).map((s) => s.id)).not.toContain('tmp1');
  });

  it('recherche les localités par NPA et par nom, sans accents', async () => {
    expect((await searchLocalities(h, '163'))[0]?.name).toBe('Bulle');
    expect((await searchLocalities(h, 'zurich'))[0]?.zip).toBe('8001');
    expect((await searchLocalities(h, 'fribourg'))[0]?.label).toBe('1700 Fribourg (FR)');
  });

  it('charge les offres et compare un panier de bout en bout', async () => {
    const products = new Map((await listCanonicalProducts(h.db)).map((p) => [p.id, p]));
    const chains = new Map((await listChains(h.db)).map((c) => [c.id, c]));
    const lines = ['farine-blanche-1kg', 'lait-entier-uht-1l', 'spaghetti-500g', 'papier-toilette-10'].map((productId, i) => ({
      id: `l${i}`,
      productId,
      qty: 1,
    }));
    const stores = await findStoresNear(h, BULLE, 10);
    const index = await loadOfferIndex(h, lines.map((l) => l.productId), [...new Set(stores.map((s) => s.chainId))], NOW);
    expect(index.products.size).toBeGreaterThan(10);
    const result = await compareBasket(
      {
        origin: BULLE,
        lines,
        prefs: DEFAULT_PREFS,
        when: { mode: 'plan', date: '2026-09-28', time: '10:00' },
        maxStores: 2,
        travel: DEFAULT_TRAVEL,
        minSavingPerExtraStoreCents: 200,
      },
      { now: NOW, products, chains, index, stores: withCrowDistance(BULLE, stores) },
    );
    expect(result.scenarios.map((s) => s.kind)).toEqual(['single_store', 'cheapest_products', 'optimized_total']);
    expect(result.meta.dataMode).toBe('demo');
    expect(result.scenarios[2]?.storeCount).toBeLessThanOrEqual(2);
  });

  it('préserve les décisions humaines lors des imports suivants', async () => {
    const csv = `chain_id;sku;name;quantity;unit;price_chf;observed_at;source_kind;source_ref
denner;R-1;Spaghetti de blé dur;500;g;1.10;2026-09-26;manual_survey;Relevé test`;
    const batch = parseImportFile(csv, 't.csv', { connectorId: 'denner', now: NOW });
    await applyBatch(h, batch, null);
    const suggested = await listMatches(h, { status: 'suggested', chainId: 'denner' });
    const m = suggested.find((x) => x.retailerProductId === 'denner:R-1');
    expect(m?.canonicalId).toBe('spaghetti-500g');
    // non validée : pas utilisée par le comparateur
    let index = await loadOfferIndex(h, ['spaghetti-500g'], ['denner'], NOW);
    expect(index.products.has('denner:R-1')).toBe(false);

    expect(await reviewMatch(h, 'spaghetti-500g', 'denner:R-1', { status: 'validated' }, 'admin@test')).toBe(true);
    index = await loadOfferIndex(h, ['spaghetti-500g'], ['denner'], NOW);
    expect(index.products.has('denner:R-1')).toBe(true);

    await reviewMatch(h, 'spaghetti-500g', 'denner:R-1', { status: 'rejected' }, 'admin@test');
    await applyBatch(h, parseImportFile(csv, 't.csv', { connectorId: 'denner', now: NOW }), null);
    const after = (await listMatches(h, { chainId: 'denner' })).find((x) => x.retailerProductId === 'denner:R-1');
    expect(after?.status).toBe('rejected');
    expect(after?.origin).toBe('admin');
  });

  it('détecte les anomalies et écarte les données rejetées', async () => {
    const csv = `chain_id;sku;name;quantity;unit;canonical_slug;price_chf;observed_at;source_kind;source_ref
coop;Q-1;Farine;1;kg;farine-blanche-1kg;1.00;2026-09-20;manual_survey;Relevé 1`;
    await applyBatch(h, parseImportFile(csv, 'a.csv', { connectorId: 'coop', now: NOW }), null);
    const csv2 = csv.replace('1.00;2026-09-20', '2.50;2026-09-26').replace('Relevé 1', 'Relevé 2');
    await applyBatch(h, parseImportFile(csv2, 'b.csv', { connectorId: 'coop', now: NOW }), null);
    const promoCsv = `chain_id;sku;type;promo_price_chf;published_at;valid_from;valid_to;source_kind;source_ref
coop;Q-1;price;2.90;2026-09-24;2026-09-24;2026-09-30;manual_survey;Prospectus`;
    await applyBatch(h, parseImportFile(promoCsv, 'p.csv', { connectorId: 'coop', now: NOW }), null);

    const report = await runQualityChecks(h, NOW, CHAINS);
    expect(report.byKind.price_jump).toBe(1);
    expect(report.byKind.promo_not_lower).toBe(1);
    const open = await listAnomalies(h);
    const promoAnomaly = open.find((a) => a.kind === 'promo_not_lower');
    expect(promoAnomaly).toBeDefined();
    // pas de doublon lors d'un second passage
    const again = await runQualityChecks(h, NOW, CHAINS);
    expect(again.anomaliesRecorded).toBe(0);

    expect(await resolveAnomaly(h, promoAnomaly!.id, 'rejected_data', 'admin@test')).toBe(true);
    const index = await loadOfferIndex(h, ['farine-blanche-1kg'], ['coop'], NOW);
    expect(index.promotionsByProduct.get('coop:Q-1')).toBeUndefined();
  });

  it('résume l’état des données par enseigne', async () => {
    const status = await chainDataStatus(h, NOW);
    const coop = status.find((s) => s.chainId === 'coop');
    expect(coop?.stores).toBe(2);
    expect(coop?.realPrices).toBeGreaterThan(0);
    expect(status.find((s) => s.chainId === 'migros')?.demoProducts).toBeGreaterThan(100);
  });
});
