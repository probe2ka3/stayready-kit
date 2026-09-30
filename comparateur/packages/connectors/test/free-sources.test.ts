import { describe, expect, it } from 'vitest';
import {
  buildOfferIndex,
  DEFAULT_FRESHNESS,
  DEFAULT_PREFS,
  profileForStore,
  resolveLine,
  storeSpecificIds,
  VARIABLE_WEIGHT_LABEL,
  zurichToday,
  type Store,
} from '@cabas/core';
import { PRODUCTS } from '@cabas/reference';
import { buildOpenPricesBatch, buildRelevesBatch, categorySlug, matchesFor, RELEVE_COLUMNS, type OpLocation, type OpPrice } from '../src';

// Données de test fictives (aucun prix réel) : vérifient les règles, pas les montants.
const now = new Date('2026-09-30T10:00:00Z');
const src = { connectorId: 'osm-stores', kind: 'open_data' as const, ref: 'test' };
const stores: Store[] = [
  { id: 'osm:node/1', chainId: 'migros', name: 'Migros', street: 'Rue A 1', city: 'Bulle', lat: 46.62, lon: 7.06, zoneId: 'migros-nf', source: src },
  { id: 'osm:node/2', chainId: 'migros', name: 'Migros', street: 'Rue B 2', city: 'Riaz', lat: 46.64, lon: 7.07, zoneId: 'migros-nf', source: src },
  { id: 'osm:node/3', chainId: 'coop', name: 'Coop', city: 'Bulle', lat: 46.62, lon: 7.05, source: src },
];
const header = RELEVE_COLUMNS.join(';');
const row = (o: Partial<Record<(typeof RELEVE_COLUMNS)[number], string>>) =>
  RELEVE_COLUMNS.map(
    (c) =>
      ({
        enseigne: 'migros',
        magasin: 'osm:node/1',
        date: '2026-09-29',
        besoin: 'spaghetti-500g',
        article: 'Spaghetti test',
        contenance: '500',
        unite: 'g',
        prix_chf: '1.50',
        preuve: 'photo test',
        ...o,
      })[c] ?? '',
  ).join(';');
const csv = (...rows: string[]) => [header, ...rows].join('\n');

describe('relevés en magasin', () => {
  it('un prix vaut pour un magasin et un jour, avec sa preuve et son besoin déclaré', () => {
    const batch = buildRelevesBatch([{ name: 'bulle.csv', content: csv(row({})) }], { now, stores });
    expect(batch.report.rejected).toEqual([]);
    expect(batch.retailerProducts[0]).toMatchObject({ chainId: 'migros', declaredSlug: 'spaghetti-500g', quantity: { amount: 500, unit: 'g' } });
    expect(batch.prices[0]).toMatchObject({ storeId: 'osm:node/1', zoneId: null, priceCents: 150, reliability: 'survey', priceType: 'regular', observedAtPlace: 'Migros, Rue A 1, Bulle' });
    expect(batch.prices[0]?.source.ref).toContain('bulle.csv:2 — photo test');
    expect(batch.promotions).toEqual([]);
  });

  it('vente au poids : prix au kilo ramené à la quantité du besoin et marqué « estimé »', () => {
    const batch = buildRelevesBatch(
      [{ name: 'a.csv', content: csv(row({ besoin: 'citrons-500g', article: 'Citrons', contenance: '', unite: 'kg', au_poids: 'oui', prix_chf: '4.00' })) }],
      { now, stores },
    );
    expect(batch.retailerProducts[0]?.quantity).toEqual({ amount: 500, unit: 'g' });
    expect(batch.retailerProducts[0]?.attributes.labels).toContain(VARIABLE_WEIGHT_LABEL);
    expect(batch.prices[0]?.priceCents).toBe(200);
  });

  it('action sans fin affichée : valable le jour du relevé seulement ; carte vérifiée', () => {
    const batch = buildRelevesBatch(
      [
        {
          name: 'a.csv',
          content: csv(
            row({ prix_action_chf: '1.20', carte: 'cumulus' }),
            row({ besoin: 'penne-500g', article: 'Penne test', prix_chf: '', prix_action_chf: '1.10', action_du: '2026-09-29', action_au: '2026-10-05' }),
          ),
        },
      ],
      { now, stores },
    );
    expect(batch.report.rejected).toEqual([]);
    expect(batch.promotions[0]).toMatchObject({ validFrom: '2026-09-29', validTo: '2026-09-29', loyaltyProgram: 'cumulus', promoPriceCents: 120, referencePriceCents: 150, endIsPresumed: false, storeId: 'osm:node/1' });
    expect(batch.promotions[1]).toMatchObject({ validFrom: '2026-09-29', validTo: '2026-10-05', referencePriceCents: null });
    // Prix normal inconnu : aucune observation de prix normal n'est créée.
    expect(batch.prices).toHaveLength(1);
  });

  it('écarte les lignes invalides avec leur motif, ignore les exemples', () => {
    const batch = buildRelevesBatch(
      [
        {
          name: 'a.csv',
          content: csv(
            row({ magasin: 'osm:node/999' }),
            row({ magasin: 'osm:node/3' }),
            row({ date: '2026-10-02' }),
            row({ besoin: 'caviar-50g' }),
            row({ preuve: '' }),
            row({ unite: 'ml' }),
            row({ prix_action_chf: '1.60' }),
            row({ carte: 'supercard' }),
            row({ prix_chf: '', prix_action_chf: '' }),
            row({ besoin: 'concombre-1', au_poids: 'oui', unite: 'kg' }),
            row({ preuve: 'EXEMPLE fictif' }),
            row({ besoin: 'gruyere-aop-250g', article: 'Gruyère doux', contenance: '250', suisse: 'oui' }),
          ),
        },
      ],
      { now, stores },
    );
    expect(batch.prices).toEqual([]);
    expect(batch.report.rejected.map((r) => r.field)).toEqual(['magasin', 'magasin', 'date', 'besoin', 'preuve', 'unite', 'prix_action_chf', 'carte', 'prix_chf', 'unite', 'besoin']);
    expect(batch.report.metrics?.ignoredExamples).toBe(1);
  });

  it('exigences du besoin : origine suisse déclarée, AOP lue dans la désignation', () => {
    const batch = buildRelevesBatch(
      [{ name: 'a.csv', content: csv(row({ besoin: 'gruyere-aop-250g', article: 'Le Gruyère AOP doux', contenance: '250', suisse: 'oui', prix_chf: '5.00' })) }],
      { now, stores },
    );
    expect(batch.report.rejected).toEqual([]);
    expect(batch.retailerProducts[0]?.attributes).toMatchObject({ swissOrigin: true, labels: ['aop'] });
  });

  it('un fichier sans les colonnes obligatoires est refusé entièrement', () => {
    const batch = buildRelevesBatch([{ name: 'x.csv', content: 'enseigne;prix_chf\nmigros;1.00' }], { now, stores });
    expect(batch.report.rejected[0]?.message).toMatch(/Colonnes manquantes/);
  });

  it('le comparateur n’applique le relevé qu’au magasin relevé ; une revue peut refuser la correspondance', () => {
    const batch = buildRelevesBatch([{ name: 'a.csv', content: csv(row({})) }], { now, stores });
    const { matches } = matchesFor(batch.retailerProducts, PRODUCTS);
    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({ status: 'validated', kind: 'equivalent' });
    const index = buildOfferIndex({ products: batch.retailerProducts, matches, prices: batch.prices, promotions: [] });
    const specific = storeSpecificIds(index);
    const canonical = PRODUCTS.find((p) => p.slug === 'spaghetti-500g')!;
    const ctx = { asOf: now, today: zurichToday(now), targetDate: zurichToday(now), policy: DEFAULT_FRESHNESS, prefs: DEFAULT_PREFS };
    const line = { id: 'l1', productId: canonical.id, qty: 2 };
    const here = resolveLine(line, canonical, profileForStore(stores[0]!, specific), index, ctx);
    expect(here.option).toMatchObject({ totalCents: 300, packs: 2, status: 'verified' });
    expect(here.option?.statusReasons).toContain('store_specific_price');
    expect(resolveLine(line, canonical, profileForStore(stores[1]!, specific), index, ctx).option).toBeNull();

    const refused = matchesFor(batch.retailerProducts, PRODUCTS, [
      { retailerProductId: batch.retailerProducts[0]!.id, canonicalSlug: null, reviewer: 'test', reviewedAt: '2026-09-30' },
    ]);
    expect(refused.matches).toEqual([]);
  });
});

describe('Open Prices : prix sans code-barres (vrac)', () => {
  const locations: OpLocation[] = [{ id: 1, osm_id: 10, osm_type: 'NODE', osm_name: 'Denner', osm_brand: 'Denner', osm_address_city: 'Meyrin' }];
  const cat = (o: Partial<OpPrice>): OpPrice => ({ id: 1, type: 'CATEGORY', category_tag: 'en:bananas', price_per: 'KILOGRAM', price: 2, currency: 'CHF', date: '2026-09-20', location_id: 1, ...o });

  it('associe seulement les catégories précises du noyau', () => {
    expect(categorySlug({ category_tag: 'en:bananas' })).toBe('bananes-1kg');
    expect(categorySlug({ category_tag: 'en:apples', product_name: 'Pommes Gala' })).toBe('pommes-gala-1kg');
    expect(categorySlug({ category_tag: 'en:apples', product_name: null })).toBe('pommes-gala-1kg');
    expect(categorySlug({ category_tag: 'en:apples', product_name: 'Pommes Pink Lady' })).toBeNull();
    expect(categorySlug({ category_tag: 'en:potatoes', product_name: 'Pommes de terre' })).toBeNull();
    expect(categorySlug({ category_tag: 'en:potatoes', product_name: 'Kartoffeln festkochend' })).toBe('pdt-fermes-2500g');
    expect(categorySlug({ category_tag: 'en:onions', product_name: 'Oignons rouges' })).toBeNull();
    expect(categorySlug({ category_tag: 'en:tomatoes', product_name: 'Tomates' })).toBeNull();
  });

  it('prix au kilo ramené au besoin, prix à la pièce pour un besoin en pièces', () => {
    const batch = buildOpenPricesBatch(
      locations,
      [
        cat({ id: 1, category_tag: 'en:oranges', price: 2.5, origins_tags: ['en:spain'] }),
        cat({ id: 2, category_tag: 'en:cucumbers', price_per: 'UNIT', price: 1.1 }),
        cat({ id: 3, category_tag: 'en:cucumbers', price_per: 'KILOGRAM' }),
        cat({ id: 4, category_tag: 'en:apples', product_name: 'Pommes Jazz' }),
        cat({ id: 5, category_tag: 'en:carrots', labels_tags: ['en:organic'], origins_tags: ['en:switzerland'] }),
      ],
      { now, stores: [], maxAgeDays: 400 },
    );
    expect(batch.prices.map((p) => [p.retailerProductId, p.priceCents])).toEqual([
      ['denner:cat-oranges-2kg', 500],
      ['denner:cat-concombre-1', 110],
      ['denner:cat-carottes-1kg-bio-ch', 200],
    ]);
    const oranges = batch.retailerProducts.find((p) => p.id === 'denner:cat-oranges-2kg')!;
    expect(oranges).toMatchObject({ declaredSlug: 'oranges-2kg', quantity: { amount: 2000, unit: 'g' } });
    expect(oranges.attributes.labels).toContain(VARIABLE_WEIGHT_LABEL);
    expect(batch.retailerProducts.find((p) => p.id === 'denner:cat-concombre-1')!.attributes.labels).not.toContain(VARIABLE_WEIGHT_LABEL);
    expect(batch.report.metrics).toMatchObject({ categoryPrices: 3, 'skipped: unité de prix incompatible': 1, 'skipped: catégorie hors noyau ou imprécise': 1 });
    expect(matchesFor(batch.retailerProducts, PRODUCTS).matches.every((m) => m.status === 'validated')).toBe(true);
  });
});

describe('instantanés : sources publiables et privées séparées', () => {
  it('une source non publiable est écrite hors du dossier versionné et en efface toute copie', async () => {
    const { mkdtemp, mkdir, writeFile, rm } = await import('node:fs/promises');
    const { existsSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const { readLiveSnapshots, writeLiveSnapshot } = await import('../src');
    const dir = await mkdtemp(join(tmpdir(), 'tesprix-snap-'));
    try {
      const snap = (connectorId: string) => ({ connectorId, label: connectorId, license: null, attribution: null, collectedAt: now.toISOString(), status: 'success' as const, message: null, metrics: {}, batch: { retailerProducts: [], prices: [], promotions: [] } });
      await mkdir(join(dir, 'prices', 'live'), { recursive: true });
      await writeFile(join(dir, 'prices', 'live', 'aldi-api.json'), JSON.stringify(snap('aldi-api')));
      await writeLiveSnapshot(dir, snap('aldi-api'));
      await writeLiveSnapshot(dir, snap('denner-web'));
      await writeLiveSnapshot(dir, snap('lidl-web'));
      expect(existsSync(join(dir, 'prices', 'live', 'aldi-api.json'))).toBe(false);
      expect(existsSync(join(dir, 'private', 'live', 'aldi-api.json'))).toBe(true);
      expect(existsSync(join(dir, 'private', 'live', 'denner-web.json'))).toBe(true);
      expect(existsSync(join(dir, 'prices', 'live', 'lidl-web.json'))).toBe(true);
      expect((await readLiveSnapshots(dir)).map((s) => [s.connectorId, s.private])).toEqual([['aldi-api', true], ['denner-web', true], ['lidl-web', false]]);
      expect((await readLiveSnapshots(dir, { publicOnly: true })).map((s) => s.connectorId)).toEqual(['lidl-web']);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
