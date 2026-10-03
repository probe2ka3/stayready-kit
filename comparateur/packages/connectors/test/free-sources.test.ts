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
import { buildOpenPricesBatch, buildRelevesBatch as buildRaw, categorySlug, incompatibleVariants, matchesFor, privateLeaks, RELEVE_COLUMNS, type OpLocation, type OpPrice, type ReleveOptions } from '../src';

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
        preuve: 'IMG_0001.jpg',
        releve_par: 'Testeur',
        statut: 'valide',
        valide_par: 'Validatrice',
        ...o,
      })[c] ?? '',
  ).join(';');
const csv = (...rows: string[]) => [header, ...rows].join('\n');
// Preuve présente dans le dossier privé (fictive) ; les autres options par défaut.
const buildRelevesBatch = (files: Array<{ name: string; content: string }>, opts: ReleveOptions) => buildRaw(files, { proofFiles: new Set(['IMG_0001.jpg']), ...opts });

describe('relevés en magasin', () => {
  it('un prix vaut pour un magasin et un jour, avec sa preuve et son besoin déclaré', () => {
    const batch = buildRelevesBatch([{ name: 'bulle.csv', content: csv(row({})) }], { now, stores });
    expect(batch.report.rejected).toEqual([]);
    expect(batch.retailerProducts[0]).toMatchObject({ chainId: 'migros', declaredSlug: 'spaghetti-500g', quantity: { amount: 500, unit: 'g' } });
    expect(batch.prices[0]).toMatchObject({ storeId: 'osm:node/1', zoneId: null, priceCents: 150, reliability: 'survey', priceType: 'regular', observedAtPlace: 'Migros, Rue A 1, Bulle' });
    // Référence publique : jour du relevé seulement (ni fichier, ni preuve, ni auteur).
    expect(batch.prices[0]?.source.ref).toBe('relevé en magasin du 2026-09-29');
    expect(batch.lines[0]).toMatchObject({ status: 'publie', file: 'bulle.csv', line: 2, proof: 'IMG_0001.jpg' });
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
    // Relevé local : propre au magasin relevé et toujours indicatif (jamais « vérifié »).
    expect(here.option).toMatchObject({ totalCents: 300, packs: 2, status: 'indicative', reliability: 'survey', observedAtPlace: 'Migros, Rue A 1, Bulle' });
    expect(here.option?.statusReasons).toEqual(expect.arrayContaining(['store_specific_price', 'local_survey']));
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

describe('Open Prices : lieu sans enseigne attribué après revue (marques propres seulement)', () => {
  const mall: OpLocation = { id: 7, osm_id: 99, osm_type: 'WAY', osm_name: 'Centre commercial', osm_brand: null, osm_address_city: 'La Chaux-de-Fonds', osm_lat: 47.1, osm_lon: 6.83 };
  const migrosStore = { id: 'osm:node/1', chainId: 'migros', name: 'Migros', city: 'La Chaux-de-Fonds', canton: 'NE', zoneId: 'migros-nf', lat: 47.1, lon: 6.83 } as unknown as Parameters<typeof buildOpenPricesBatch>[2]['stores'][number];
  const review = { locationId: 7, statut: 'etablie' as const, chainId: 'migros', storeId: 'osm:node/1', ownBrands: ['M-Budget', 'Boncampo'], evidence: 'test', reviewer: 'test', reviewedAt: '2026-10-03' };
  const item = (id: number, brands: string, code: string): OpPrice => ({
    id,
    type: 'PRODUCT',
    product_code: code,
    price: 3.5,
    currency: 'CHF',
    date: '2026-09-20',
    location_id: 7,
    product: { code, product_name: 'Café moulu', brands, product_quantity: 500, product_quantity_unit: 'g' },
  });
  const prices = [item(1, 'Boncampo', '7613312525302'), item(2, 'M Budget, Migros', '7613404619285'), item(3, 'Nutella', '80176800')];

  it('sans revue : lieu hors périmètre ; avec revue : seuls les articles de marque propre, zone de la succursale', () => {
    expect(buildOpenPricesBatch([mall], prices, { now, stores: [migrosStore], maxAgeDays: 400 }).prices).toEqual([]);
    const batch = buildOpenPricesBatch([mall], prices, { now, stores: [migrosStore], maxAgeDays: 400, locationReviews: [review] });
    expect(batch.prices.map((p) => [p.retailerProductId, p.zoneId, p.observedAtPlace])).toEqual([
      ['migros:gtin-7613312525302', 'migros-nf', 'Migros (Centre commercial), La Chaux-de-Fonds'],
      ['migros:gtin-7613404619285', 'migros-nf', 'Migros (Centre commercial), La Chaux-de-Fonds'],
    ]);
    // Date réelle du relevé, jamais celle de l'import.
    expect(batch.prices[0]?.observedAt.slice(0, 10)).toBe('2026-09-20');
    expect(batch.report.metrics).toMatchObject({ attributedPrices: 2, 'skipped: lieu partagé : article sans marque propre de l’enseigne': 1 });
  });

  it('attribution incertaine (indices seulement) : aucun relevé attribué, la décision reste documentée', () => {
    const batch = buildOpenPricesBatch([mall], prices, { now, stores: [migrosStore], maxAgeDays: 400, locationReviews: [{ ...review, statut: 'incertaine' }] });
    expect(batch.prices).toEqual([]);
    expect(batch.report.metrics).toMatchObject({ attributedPrices: 0, 'skipped: lieu sans enseigne : attribution incertaine': 3 });
  });

  it('succursale de l’enseigne introuvable : relevés écartés', () => {
    const batch = buildOpenPricesBatch([mall], prices, { now, stores: [], maxAgeDays: 400, locationReviews: [review] });
    expect(batch.prices).toEqual([]);
    expect(batch.report.metrics).toMatchObject({ 'skipped: lieu attribué : succursale inconnue': 2 });
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

describe('instantanés : provenance établie par le fichier et l’hôte des URL, pas par l’étiquette', () => {
  const product = (id: string, chainId: string, connectorId: string, url: string) => ({
    id,
    chainId,
    connectorId,
    sku: id,
    gtin: null,
    name: id,
    brand: null,
    quantity: { amount: 1000, unit: 'ml' as const },
    attributes: {},
    url,
    isDemo: false,
  });
  const price = (id: string, retailerProductId: string, connectorId: string, url: string) => ({
    id,
    retailerProductId,
    zoneId: null,
    storeId: null,
    priceCents: 155,
    observedAt: '2026-10-02T08:00:00.000Z',
    source: { connectorId, kind: 'open_data' as const, ref: null },
    sourceUrl: url,
    isDemo: false,
  });
  const snap = (connectorId: string, batch: { retailerProducts: unknown[]; prices: unknown[] }) => ({
    connectorId,
    label: connectorId,
    license: null,
    attribution: null,
    collectedAt: '2026-10-03T06:00:00.000Z',
    status: 'success' as const,
    message: null,
    metrics: {},
    batch: { ...batch, promotions: [] },
  });

  async function withDir(files: Record<string, unknown>, check: (dir: string) => Promise<void>) {
    const { mkdtemp, mkdir, writeFile, rm } = await import('node:fs/promises');
    const { tmpdir } = await import('node:os');
    const { dirname, join } = await import('node:path');
    const dir = await mkdtemp(join(tmpdir(), 'tesprix-prov-'));
    try {
      for (const [path, content] of Object.entries(files)) {
        await mkdir(dirname(join(dir, path)), { recursive: true });
        await writeFile(join(dir, path), JSON.stringify(content));
      }
      await check(dir);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }

  it('un relevé Open Prices pour Aldi, Coop ou Migros reste publiable ; un prix Aldi réétiqueté « open-prices » est écarté', async () => {
    const { readLiveSnapshots } = await import('../src');
    const { buildOfferIndex, restrictedConnectorIds } = await import('@cabas/core');
    const op = 'https://prices.openfoodfacts.org/prices/';
    await withDir(
      {
        'prices/live/open-prices.json': snap('open-prices', {
          retailerProducts: [
            product('aldi:gtin-7610000000001', 'aldi', 'open-prices', `${op}1`),
            product('coop:gtin-7610000000002', 'coop', 'open-prices', `${op}2`),
            product('migros:gtin-7610000000003', 'migros', 'open-prices', `${op}3`),
            // Article et prix venus de l'API Aldi, étiquetés « open-prices » : l'hôte trahit la source.
            product('aldi:4711', 'aldi', 'open-prices', 'https://www.aldi-suisse.ch/fr/produit/lait-4711'),
            product('aldi:gtin-7610000000009', 'aldi', 'open-prices', `${op}9`),
          ],
          prices: [
            price('open-prices:1', 'aldi:gtin-7610000000001', 'open-prices', `${op}1`),
            price('open-prices:2', 'coop:gtin-7610000000002', 'open-prices', `${op}2`),
            price('open-prices:3', 'migros:gtin-7610000000003', 'open-prices', `${op}3`),
            price('open-prices:4', 'aldi:4711', 'open-prices', `${op}4`),
            price('open-prices:9', 'aldi:gtin-7610000000009', 'open-prices', 'https://api.aldi-suisse.ch/v3/product-search?q=lait'),
            price('open-prices:10', 'aldi:gtin-7610000000001', 'aldi-api', `${op}10`),
          ],
        }),
      },
      async (dir) => {
        const [s] = await readLiveSnapshots(dir, { publicOnly: true });
        expect(s?.connectorId).toBe('open-prices');
        expect(s?.batch.prices.map((p) => p.id)).toEqual(['open-prices:1', 'open-prices:2', 'open-prices:3']);
        expect(s?.batch.retailerProducts.map((p) => p.chainId)).toEqual(['aldi', 'coop', 'migros', 'aldi']);
        // 1 article (hôte Aldi) + 3 prix (article écarté, URL Aldi, étiquette aldi-api).
        expect(s?.provenanceRejected).toBe(4);
        // Même relu sans filtre, l'index public ne garde que les relevés Open Prices.
        const all = await readLiveSnapshots(dir);
        const index = buildOfferIndex(
          { products: all.flatMap((x) => x.batch.retailerProducts), matches: [], prices: all.flatMap((x) => x.batch.prices), promotions: [] },
          { excludeConnectors: restrictedConnectorIds([]) },
        );
        expect([...index.pricesByProduct.keys()].sort()).toEqual(['aldi:gtin-7610000000001', 'coop:gtin-7610000000002', 'migros:gtin-7610000000003']);
      },
    );
  });

  it('un fichier privé ne devient jamais publiable : ni par l’étiquette de ses prix, ni par celle du fichier, ni par son nom', async () => {
    const { readLiveSnapshots } = await import('../src');
    const { buildOfferIndex, restrictedConnectorIds } = await import('@cabas/core');
    const denner = 'https://www.denner.ch/fr/produits/lait-123';
    const relabelled = snap('denner-web', {
      retailerProducts: [product('denner:123', 'denner', 'open-prices', denner)],
      prices: [price('denner:123:p', 'denner:123', 'open-prices', denner)],
    });
    await withDir(
      {
        'private/live/denner-web.json': relabelled,
        // Copie du fichier privé renommée et réétiquetée « open-prices » dans le dossier privé, puis dans le public.
        'private/live/open-prices.json': { ...relabelled, connectorId: 'open-prices' },
        'prices/live/open-prices.json': { ...relabelled, connectorId: 'open-prices' },
        // Nom de fichier et étiquette divergents : ignoré.
        'prices/live/lidl-web.json': { ...relabelled, connectorId: 'denner-web' },
      },
      async (dir) => {
        const all = await readLiveSnapshots(dir);
        const denner = all.find((s) => s.connectorId === 'denner-web');
        expect(denner?.private).toBe(true);
        // Les enregistrements prennent l'étiquette de leur fichier privé.
        expect(denner?.batch.prices.map((p) => p.source.connectorId)).toEqual(['denner-web']);
        expect(denner?.batch.retailerProducts.map((p) => p.connectorId)).toEqual(['denner-web']);
        // Le fichier public réétiqueté ne garde aucun enregistrement (hôte Denner).
        const op = all.find((s) => s.connectorId === 'open-prices');
        expect(op?.batch.prices).toEqual([]);
        expect(op?.provenanceRejected).toBe(2);
        expect(all.map((s) => s.connectorId)).toEqual(['denner-web', 'open-prices']);
        const index = buildOfferIndex(
          { products: all.flatMap((x) => x.batch.retailerProducts), matches: [], prices: all.flatMap((x) => x.batch.prices), promotions: [] },
          { excludeConnectors: restrictedConnectorIds([]) },
        );
        expect(index.pricesByProduct.size).toBe(0);
        expect((await readLiveSnapshots(dir, { publicOnly: true })).flatMap((s) => s.batch.prices)).toEqual([]);
      },
    );
  });
});

describe('relevés en magasin : validation, preuve et export public épuré', () => {
  const opts = (extra: Partial<ReleveOptions> = {}): ReleveOptions => ({ now, stores, proofFiles: new Set(['IMG_0001.jpg', 'ticket-0930.pdf']), ...extra });
  const one = (o: Parameters<typeof row>[0], extra: Partial<ReleveOptions> = {}) => buildRaw([{ name: '2026-09-bulle-migros.csv', content: csv(row(o)) }], opts(extra));

  it('relevé incomplet (contenance, prix ou preuve manquants) : invalide, jamais publié, motif dans le rapport privé', () => {
    for (const [o, field] of [
      [{ contenance: '' }, 'contenance'],
      [{ prix_chf: '' }, 'prix_chf'],
      [{ preuve: '' }, 'preuve'],
      [{ unite: '' }, 'unite'],
    ] as const) {
      const b = one(o);
      expect(b.prices, field).toEqual([]);
      expect(b.lines[0], field).toMatchObject({ status: 'invalide' });
      expect(b.lines[0]?.reasons[0], field).toMatch(new RegExp(`^${field}`));
    }
  });

  it('publication seulement si validé, avec validateur et fichier de preuve présent', () => {
    expect(one({ statut: '' }).lines[0]).toMatchObject({ status: 'en_attente', reasons: [expect.stringMatching(/en attente de validation/)] });
    expect(one({ statut: 'a_valider' }).prices).toEqual([]);
    expect(one({ valide_par: '' }).lines[0]?.reasons).toEqual(['valide_par manquant']);
    expect(one({ statut: 'refuse' }).lines[0]).toMatchObject({ status: 'refuse' });
    // Preuve citée sans fichier (note, numéro de ticket) ou fichier absent du dossier privé.
    expect(one({ preuve: 'ticket 4521' }).lines[0]?.reasons[0]).toMatch(/preuve à fournir en fichier/);
    expect(one({ preuve: 'IMG_9999.jpg' }).lines[0]?.reasons[0]).toMatch(/absent du dossier privé : IMG_9999.jpg/);
    expect(one({ preuve: 'ticket-0930.pdf' }).lines[0]?.status).toBe('publie');
    // Aucune liste de preuves fournie : rien n'est vérifiable, rien n'est publié.
    expect(one({}, { proofFiles: undefined }).prices).toEqual([]);
  });

  it('correspondance : besoin des 50 seulement, variante exclue par les règles revues refusée', () => {
    const rules = incompatibleVariants([
      { id: 'lidl-penne', canonicalSlug: 'penne-500g', exclude: ['mini ', 'complet', 'sans gluten'], organic: false },
      { id: 'lidl-confiture', canonicalSlug: 'confiture-fraises-500g', require: ['fraise'] },
    ]);
    // Besoin du catalogue mais hors des 50 du noyau : relevé conservé dans le rapport privé, non publié.
    expect(one({ besoin: 'fusilli-500g', article: 'Fusilli' }).lines[0]).toMatchObject({ status: 'refuse', reasons: [expect.stringMatching(/fusilli-500g hors des 50 du noyau/)] });
    expect(one({ besoin: 'caviar-50g' }).lines[0]?.status).toBe('invalide');
    const penne = (o: Parameters<typeof row>[0]) => one({ besoin: 'penne-500g', article: 'Penne', ...o }, { incompatible: rules });
    expect(penne({}).lines[0]?.status).toBe('publie');
    expect(penne({ variante: 'complètes' }).lines[0]).toMatchObject({ status: 'refuse', reasons: [expect.stringMatching(/« complet », règle revue lidl-penne/)] });
    expect(penne({ bio: 'oui' }).lines[0]?.reasons[0]).toMatch(/article bio/);
    const conf = one({ besoin: 'confiture-fraises-500g', article: 'Confiture', variante: 'abricots', contenance: '500' }, { incompatible: rules });
    expect(conf.lines[0]?.reasons[0]).toMatch(/mention « fraise » absente/);
  });

  it('code-barres : clé de contrôle vérifiée ; valide → même article identifiable entre enseignes', () => {
    expect(one({ code_barres: '7610000000018' }).lines[0]).toMatchObject({ status: 'invalide', reasons: [expect.stringMatching(/^code_barres/)] });
    expect(one({ code_barres: '7610000000011' }).retailerProducts[0]?.gtin).toBe('7610000000011');
  });

  it('conditions de l’action : « dès 2 » calculée, autre condition affichée mais jamais appliquée', () => {
    expect(one({ prix_action_chf: '1.20', conditions: 'dès 2 paquets' }).promotions[0]).toMatchObject({ type: 'min_qty_price', minQty: 2 });
    expect(one({ prix_action_chf: '1.20', conditions: 'avec le bon du journal' }).promotions[0]).toMatchObject({ type: 'conditional' });
    expect(one({ conditions: 'dès 2' }).lines[0]?.status).toBe('invalide');
  });

  it('export public : aucune donnée privée (fichier, preuve, auteur, validateur) ; contrôle bloquant', () => {
    const files = [{ name: '2026-09-bulle-migros.csv', content: csv(row({ preuve: 'IMG_0001.jpg + ticket-0930.pdf' })) }];
    const b = buildRaw(files, opts());
    expect(b.prices).toHaveLength(1);
    const pub = { retailerProducts: b.retailerProducts, prices: b.prices, promotions: b.promotions };
    const json = JSON.stringify(pub);
    for (const secret of ['2026-09-bulle-migros.csv', 'IMG_0001', 'ticket-0930', 'Testeur', 'Validatrice']) expect(json).not.toContain(secret);
    expect(privateLeaks(pub, files)).toEqual([]);
    // Une fuite (par ex. preuve recopiée dans la désignation) est détectée et bloque la publication.
    const leaked = { ...pub, retailerProducts: pub.retailerProducts.map((p) => ({ ...p, name: `${p.name} IMG_0001.jpg` })) };
    expect(privateLeaks(leaked, files)).toEqual(['IMG_0001.jpg']);
    // Le rapport privé garde la preuve pour la vérification.
    expect(b.lines[0]).toMatchObject({ status: 'publie', proof: 'IMG_0001.jpg + ticket-0930.pdf' });
  });
});
