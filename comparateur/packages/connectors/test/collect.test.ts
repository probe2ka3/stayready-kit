import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { checkCollection } from '@cabas/core';
import {
  buildLidlBatch,
  buildOpenPricesBatch,
  chainForLocation,
  discoverAssortmentCategories,
  discoverOfferPages,
  discoverProductPages,
  HttpBlockedError,
  HttpBudgetError,
  HttpFetchError,
  isAllowed,
  matchesFor,
  mergeLiveBatch,
  parseAssortmentPage,
  parseOfferPage,
  parsePackText,
  parseProductPage,
  rotationSlice,
  parseRegions,
  parseRobots,
  PoliteFetcher,
  unitPriceDeviation,
  type OpLocation,
  type OpPrice,
  offerMechanic,
} from '../src';
import { PRODUCTS } from '@cabas/reference';

const UA = 'TesPrixBot/0.1 (test)';

describe('robots.txt (RFC 9309)', () => {
  const txt = `# exemple
User-agent: *
Disallow: /*?
Disallow: /catalog/
Allow: /catalog/public$
Crawl-delay: 10

User-agent: TesPrixBot
Disallow: /private/

Sitemap: https://example.ch/sitemap.xml`;

  it('choisit le groupe propre à l’agent, sinon le groupe *', () => {
    const own = parseRobots(txt, UA);
    expect(isAllowed(own, '/catalog/x')).toBe(true);
    expect(isAllowed(own, '/private/a')).toBe(false);
    const other = parseRobots(txt, 'AutreBot/1.0');
    expect(other.crawlDelaySec).toBe(10);
    expect(other.sitemaps).toEqual(['https://example.ch/sitemap.xml']);
  });

  it('applique jokers, ancre $ et règle la plus longue', () => {
    const p = parseRobots(txt, 'AutreBot/1.0');
    expect(isAllowed(p, '/fr/milchprodukte-eier')).toBe(true);
    expect(isAllowed(p, '/fr/milchprodukte-eier?p=2')).toBe(false);
    expect(isAllowed(p, '/catalog/product/1')).toBe(false);
    expect(isAllowed(p, '/catalog/public')).toBe(true);
    expect(isAllowed(p, '/catalog/public/2')).toBe(false);
    // « /catalog/ » ne vise que la racine
    expect(isAllowed(p, '/fr/catalog/product/1')).toBe(true);
    expect(isAllowed(p, '/robots.txt')).toBe(true);
  });

  it('« Disallow: » vide n’interdit rien', () => {
    expect(isAllowed(parseRobots('User-agent: *\nDisallow:', UA), '/tout')).toBe(true);
  });
});

function fakeFetch(routes: Record<string, { status: number; body: string; headers?: Record<string, string> }>) {
  const calls: string[] = [];
  const impl = (async (input: string | URL) => {
    const url = String(input);
    calls.push(url);
    const r = routes[url];
    if (!r) return new Response('introuvable', { status: 404 });
    return new Response(r.body, { status: r.status, headers: { 'content-type': 'text/html', ...(r.headers ?? {}) } });
  }) as typeof fetch;
  return { impl, calls };
}

describe('client HTTP poli', () => {
  const sleeps: number[] = [];
  const base = { userAgent: UA, sleep: async (ms: number) => void sleeps.push(ms), clock: () => 0, archiveDir: null };

  it('refuse un agent de navigateur', () => {
    expect(() => new PoliteFetcher({ ...base, userAgent: 'Mozilla/5.0 Chrome' })).toThrow();
  });

  it('respecte robots.txt et le délai de collecte', async () => {
    const { impl, calls } = fakeFetch({
      'https://a.ch/robots.txt': { status: 200, body: 'User-agent: *\nDisallow: /interdit\nCrawl-delay: 5' },
      'https://a.ch/ok': { status: 200, body: 'bonjour' },
    });
    const f = new PoliteFetcher({ ...base, fetchImpl: impl });
    await expect(f.get('https://a.ch/interdit')).rejects.toBeInstanceOf(HttpBlockedError);
    expect((await f.get('https://a.ch/ok')).body).toBe('bonjour');
    await f.get('https://a.ch/ok');
    expect(calls.filter((c) => c.endsWith('/robots.txt'))).toHaveLength(1);
    expect(sleeps.some((ms) => ms >= 5000)).toBe(true);
  });

  it('s’arrête définitivement sur 403 ou défi anti-robot, sans nouvelle tentative', async () => {
    const { impl, calls } = fakeFetch({
      'https://b.ch/robots.txt': { status: 200, body: '' },
      'https://b.ch/p': { status: 403, body: 'Access Denied' },
      'https://c.ch/robots.txt': { status: 200, body: '<script src="https://ct.captcha-delivery.com/c.js"></script>' },
    });
    const f = new PoliteFetcher({ ...base, fetchImpl: impl });
    await expect(f.get('https://b.ch/p')).rejects.toMatchObject({ reason: 'forbidden', status: 403 });
    await expect(f.get('https://b.ch/autre')).rejects.toBeInstanceOf(HttpBlockedError);
    expect(calls.filter((c) => c === 'https://b.ch/p')).toHaveLength(1);
    await expect(f.get('https://c.ch/x')).rejects.toMatchObject({ reason: 'challenge' });
    expect(f.stats.blocked).toMatchObject({ 'b.ch': 'forbidden', 'c.ch': 'challenge' });
  });

  it('reprend après une erreur 503 en respectant Retry-After', async () => {
    let n = 0;
    const impl = (async (input: string | URL) => {
      const url = String(input);
      if (url.endsWith('/robots.txt')) return new Response('', { status: 404 });
      n++;
      return n === 1 ? new Response('occupé', { status: 503, headers: { 'retry-after': '7' } }) : new Response('ok', { status: 200 });
    }) as typeof fetch;
    const f = new PoliteFetcher({ ...base, fetchImpl: impl });
    expect((await f.get('https://d.ch/x')).body).toBe('ok');
    expect(f.stats.retries).toBe(1);
    expect(sleeps).toContain(7000);
  });

  it('plafond de requêtes par source : arrêt propre, sans requête supplémentaire', async () => {
    const { impl, calls } = fakeFetch({ 'https://e.ch/robots.txt': { status: 200, body: '' }, 'https://e.ch/1': { status: 200, body: 'a' }, 'https://e.ch/2': { status: 200, body: 'b' } });
    const f = new PoliteFetcher({ ...base, fetchImpl: impl, maxRequests: 2 });
    await f.get('https://e.ch/1');
    await expect(f.get('https://e.ch/2')).rejects.toBeInstanceOf(HttpBudgetError);
    expect(f.stats.budgetExhausted).toBe(true);
    expect(calls).toEqual(['https://e.ch/robots.txt', 'https://e.ch/1']);
  });

  it('disjoncteur : hôte abandonné après des erreurs consécutives', async () => {
    const { impl, calls } = fakeFetch({ 'https://g.ch/robots.txt': { status: 200, body: '' } });
    const f = new PoliteFetcher({ ...base, fetchImpl: impl, maxConsecutiveErrors: 2 });
    await expect(f.get('https://g.ch/a')).rejects.toBeInstanceOf(HttpFetchError);
    await expect(f.get('https://g.ch/b')).rejects.toBeInstanceOf(HttpFetchError);
    await expect(f.get('https://g.ch/c')).rejects.toThrow(/abandonné/);
    expect(f.stats.tripped).toEqual(['g.ch']);
    expect(calls.filter((c) => c.endsWith('/c'))).toHaveLength(0);
  });

  it('cache des plans du site : aucune requête tant que la copie est récente', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'tesprix-cache-'));
    try {
      const { impl, calls } = fakeFetch({ 'https://h.ch/robots.txt': { status: 200, body: '' }, 'https://h.ch/sitemap.xml': { status: 200, body: '<urlset/>' } });
      let clock = Date.now();
      const f = new PoliteFetcher({ ...base, clock: () => clock, fetchImpl: impl, cacheDir: dir });
      expect((await f.getCached('https://h.ch/sitemap.xml', 3_600_000)).body).toBe('<urlset/>');
      expect((await f.getCached('https://h.ch/sitemap.xml', 3_600_000)).body).toBe('<urlset/>');
      expect(f.stats.cacheHits).toBe(1);
      expect(calls.filter((c) => c.endsWith('sitemap.xml'))).toHaveLength(1);
      clock += 2 * 3_600_000;
      await f.getCached('https://h.ch/sitemap.xml', 3_600_000);
      expect(calls.filter((c) => c.endsWith('sitemap.xml'))).toHaveLength(2);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe('conditionnements', () => {
  it.each([
    ['les 185g | 100g = 2,16 CHF', 185, 'g', false],
    ['2 x 150 g | 100 g = 1.58', 300, 'g', false],
    ['6 x 1,5 l', 9000, 'ml', false],
    ['Origine: Suisse | Le kg', 1000, 'g', true],
    ['100 g | Env. 200-300 g', 100, 'g', true],
    ['La pièce', 1, 'piece', false],
    ['10 pièces', 10, 'piece', false],
    ['les 1.5l | 1L = 0,86 CHF', 1500, 'ml', false],
  ])('%s', (text, amount, unit, variable) => {
    const p = parsePackText(text);
    expect(p?.quantity).toEqual({ amount, unit });
    expect(p?.variableWeight).toBe(variable);
  });

  it('signale les contenances multiples', () => {
    expect(parsePackText('Diverses sortes | 180 g/ 200 g')?.ambiguous).toBe(true);
    expect(parsePackText('Couleurs assorties')).toBeNull();
  });

  it('contrôle la cohérence avec le prix de base publié', () => {
    expect(unitPriceDeviation('les 185g | 100g = 2,16 CHF', 399, { amount: 185, unit: 'g' })).toBeLessThan(0.01);
    expect(unitPriceDeviation('les 1.5l | 1L = 0,14 CHF', 129, { amount: 1500, unit: 'ml' })).toBeGreaterThan(1);
  });
});

const ASSORTMENT_HTML = `
<div id="am-page-count" style="display: none">3</div>
<ol>
<li class="item product product-item"> <a href="https://sortiment.lidl.ch/fr/catalog/product/view/id/1/s/lait-entier-uht-0001234/category/9/" class="product-item-link">
<strong class="product name product-item-name"> Lait entier UHT </strong></a>
<span class="pricefield pricefield--attributebox"><strong class="pricefield__price" itemprop="price" content="1.25">1.25</strong>
<span class="pricefield__footer">les 1l | 1L = 1,25 CHF</span></span>
<img alt="" class="badge__image" src="https://sortiment.lidl.ch/media/import_data/badges/Schweizer_Kreuz_FR.png"></li>
<li class="item product product-item"> <a href="https://sortiment.lidl.ch/fr/catalog/product/view/id/2/s/beurre-de-cuisine-0005678/category/9/" class="product-item-link">
<strong class="product name product-item-name"> Beurre de cuisine </strong></a>
<span class="pricefield pricefield--attributebox pricefield--discount"><span class="pricefield__header"> Aktion </span>
<strong class="pricefield__price" itemprop="price" content="2.99">2.99</strong>
<span class="pricefield__footer">les 250g | 100g = 1,20 CHF</span></span></li>
</ol>`;

function gridItem(o: Record<string, unknown>): string {
  const json = JSON.stringify({ category: 'Food', renderedTs: 1790460143, ...o });
  return `<div data-grid-data="${json.replace(/&/g, '&amp;').replace(/"/g, '&quot;')}"></div>`;
}

const OFFERS_HTML = [
  gridItem({
    erpNumber: '100',
    fullTitle: 'Poires suisses',
    storeStartDate: 1790805600, // jeu. 01.10.2026 00:00 Zurich
    storeEndDate: 1791410399, // mer. 07.10.2026 23:59 Zurich
    price: { price: 2.49, oldPrice: 3.29, discount: { discountText: '-24%' } },
    keyfacts: { description: '<ul><li>Origine: Suisse</li><li>Le kg</li></ul>' },
    canonicalPath: '/p/fr-CH/poires/p100',
  }),
  gridItem({
    erpNumber: '101',
    fullTitle: 'Lardons (action valable uniquement au Tessin)',
    storeStartDate: 1790805600,
    storeEndDate: null,
    price: { price: 2.15, oldPrice: 2.39 },
    lidlPlus: [{ price: { price: 1.99, oldPrice: 2.39 } }],
    keyfacts: { description: '<ul><li>2 x 100 g</li></ul>' },
  }),
  gridItem({ erpNumber: '102', fullTitle: 'Perceuse', category: 'Non-Food', price: { price: 49 } }),
  gridItem({
    erpNumber: '103',
    fullTitle: 'Yogourts',
    storeStartDate: 1790805600,
    storeEndDate: 1791410399,
    price: { price: 3.29, oldPrice: 0 },
    keyfacts: { description: '<ul><li>Diverses sortes, uniquement en pack de 6</li><li>6 x 180 g</li></ul>' },
  }),
].join('\n');

describe('connecteur Lidl', () => {
  const now = new Date('2026-09-28T08:00:00Z');

  it('découvre les catégories et les pages d’actions autorisées', () => {
    const xml = `<urlset><url><loc>https://sortiment.lidl.ch/fr/milchprodukte-eier</loc></url>
      <url><loc>https://sortiment.lidl.ch/fr/milchprodukte-eier/milch</loc></url>
      <url><loc>https://sortiment.lidl.ch/fr/catalog/product/view/id/1</loc></url>
      <url><loc>https://sortiment.lidl.ch/fr/tabakwaren</loc></url>
      <url><loc>https://sortiment.lidl.ch/de/milchprodukte-eier</loc></url></urlset>`;
    expect(discoverAssortmentCategories(xml)).toEqual([
      'https://sortiment.lidl.ch/fr/milchprodukte-eier',
      'https://sortiment.lidl.ch/fr/milchprodukte-eier/milch',
    ]);
    const home = '<a href="/c/fr-CH/promotions-de-la-semaine/a1"></a><a href="/c/fr-CH/parkside/a2"></a><a href="/c/fr-CH/promotions-de-la-semaine/a1"></a>';
    expect(discoverOfferPages(home)).toEqual(['https://www.lidl.ch/c/fr-CH/promotions-de-la-semaine/a1']);
  });

  it('lit l’assortiment : prix, format, origine, actions', () => {
    const { items, pageCount } = parseAssortmentPage(ASSORTMENT_HTML);
    expect(pageCount).toBe(3);
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ articleNo: '0001234', name: 'Lait entier UHT', priceCents: 125, swiss: true, isAction: false });
    expect(items[1]).toMatchObject({ articleNo: '0005678', isAction: true });
  });

  it('lit les actions datées, régionales et Lidl Plus (alimentaire uniquement)', () => {
    const { offers } = parseOfferPage(OFFERS_HTML, 'https://www.lidl.ch/c/fr-CH/x/a1');
    expect(offers.map((o) => o.erpNumber)).toEqual(['100', '101', '103']);
    expect(offers[0]).toMatchObject({ validFrom: '2026-10-01', validTo: '2026-10-07', priceCents: 249, referencePriceCents: 329, swiss: true });
    expect(offers[1]).toMatchObject({ regions: ['lidl-ticino'], validTo: null, lidlPlusPriceCents: 199, name: 'Lardons' });
    expect(offers[2]?.regions).toBeNull();
  });

  it('reconnaît les restrictions régionales', () => {
    expect(parseRegions('Viande des Grisons (valable uniquement en Suisse romande)').regions).toEqual(['lidl-romandie']);
    expect(parseRegions('Filet (valable uniquement en Suisse alémanique et en Suisse romande)').regions).toEqual([
      'lidl-romandie',
      'lidl-deutschschweiz',
    ]);
    expect(parseRegions('Yogourts, uniquement en pack de 6').regions).toBeNull();
    expect(parseRegions('Pain (valable uniquement à Genève)').unknown).toBe(true);
  });

  it('construit un lot idempotent : prix, promotions futures, portée et fidélité', () => {
    const pages = {
      assortment: [{ url: 'https://sortiment.lidl.ch/fr/milchprodukte-eier', html: ASSORTMENT_HTML, fetchedAt: now }],
      offers: [{ url: 'https://www.lidl.ch/c/fr-CH/x/a1', html: OFFERS_HTML, fetchedAt: now }],
    };
    const a = buildLidlBatch(pages, { now });
    const b = buildLidlBatch(pages, { now });
    expect(a.prices.map((p) => p.id)).toEqual(b.prices.map((p) => p.id));
    expect(a.promotions.map((p) => p.id)).toEqual(b.promotions.map((p) => p.id));

    const milk = a.prices.find((p) => p.retailerProductId === 'lidl:0001234');
    expect(milk).toMatchObject({ priceCents: 125, reliability: 'official', channel: 'store', zoneId: null, proof: 'web_page' });
    // Article en action dans l'assortiment : promotion du jour, pas de prix normal inventé.
    expect(a.prices.some((p) => p.retailerProductId === 'lidl:0005678')).toBe(false);
    expect(a.promotions.find((p) => p.retailerProductId === 'lidl:0005678')).toMatchObject({ validFrom: '2026-09-28', validTo: '2026-09-28' });

    const pears = a.promotions.filter((p) => p.retailerProductId === 'lidl:offer-100');
    expect(pears).toHaveLength(1);
    expect(pears[0]).toMatchObject({ validFrom: '2026-10-01', validTo: '2026-10-07', referencePriceCents: 329, endIsPresumed: false });
    expect(Date.parse(pears[0]!.publishedAt)).toBeLessThanOrEqual(now.getTime());

    const bacon = a.promotions.filter((p) => p.retailerProductId === 'lidl:offer-101');
    expect(bacon.map((p) => [p.zoneId, p.loyaltyProgram, p.promoPriceCents])).toEqual([
      ['lidl-ticino', null, 215],
      ['lidl-ticino', 'lidl-plus', 199],
    ]);
    expect(bacon[0]).toMatchObject({ endIsPresumed: true, validTo: '2026-10-07' });
    expect(a.retailerProducts.find((p) => p.id === 'lidl:offer-100')?.quantity).toEqual({ amount: 1000, unit: 'g' });
  });

  const productPage = (id: number, slug: string, name: string, price: string, footer: string, extra = '') => `<html><head>
    <meta property="og:url" content="https://sortiment.lidl.ch/fr/catalog/product/view/id/${id}/s/${slug}/" /></head><body>
    <nav><a href="https://www.lidl.ch/c/fr-CH/lidl-plus/s1">Lidl Plus</a> pricefield__badge--lidl-plus</nav>
    <div class="product-info-main"><h1 class="page-title"><span class="base">${name}</span></h1>
    <div class="price-box price-final_price"><span class="pricefield ${extra}"><span class="pricefield__wrapper"><span class="pricefield__body">
    <strong class="pricefield__price" itemprop="price" content="${price}">x</strong></span></span>
    <span class="pricefield__footer">${footer}</span></span></div><div class="towishlist-wrapper"></div></div></body></html>`;

  it('lit les fiches produits du plan du site (nav ignorée, tabac exclu)', () => {
    const xml = `<urlset><url><loc>https://sortiment.lidl.ch/fr/catalog/product/view/id/20</loc></url>
      <url><loc>https://sortiment.lidl.ch/fr/catalog/product/view/id/3</loc></url>
      <url><loc>https://sortiment.lidl.ch/de/catalog/product/view/id/3</loc></url>
      <url><loc>https://sortiment.lidl.ch/fr/milchprodukte-eier</loc></url></urlset>`;
    expect(discoverProductPages(xml)).toEqual([
      'https://sortiment.lidl.ch/fr/catalog/product/view/id/3',
      'https://sortiment.lidl.ch/fr/catalog/product/view/id/20',
    ]);
    const penne = parseProductPage(productPage(3, 'penne-rigate-0004321', 'Penne rigate', '0.95', 'les 500 g | 100 g = 0,19 CHF'), 'u');
    expect(penne).toMatchObject({ articleNo: '0004321', name: 'Penne rigate', priceCents: 95, lidlPlusPriceCents: null, isAction: false });
    expect(parseProductPage(productPage(4, 'brunette-soft-0001198', 'Brunette D.ble Filtre Soft', '9.39', 'les 20 pièces'), 'u')).toBeNull();
    expect(parseProductPage('<html>maintenance</html>', 'u')).toBeNull();

    const batch = buildLidlBatch(
      { assortment: [], offers: [], products: [{ url: 'https://sortiment.lidl.ch/fr/catalog/product/view/id/3', html: productPage(3, 'penne-rigate-0004321', 'Penne rigate', '0.95', 'les 500 g | 100 g = 0,19 CHF'), fetchedAt: now }] },
      { now },
    );
    expect(batch.prices[0]).toMatchObject({ retailerProductId: 'lidl:0004321', priceCents: 95 });
    expect(batch.report.metrics?.productPagesRead).toBe(1);
  });

  it('rotation des fiches : chaque fiche relue une fois par cycle, sans état', () => {
    const urls = Array.from({ length: 10 }, (_, i) => `u${i}`);
    const seen = new Set<string>();
    for (let d = 0; d < 4; d++) {
      const r = rotationSlice(urls, 3, new Date(Date.UTC(2026, 8, 28 + d, 8)));
      expect(r.chunks).toBe(4);
      r.slice.forEach((u) => seen.add(u));
    }
    expect(seen.size).toBe(10);
    expect(rotationSlice(urls, 0, now).slice).toEqual([]);
  });
});

describe('connecteur Open Prices', () => {
  const now = new Date('2026-09-28T08:00:00Z');
  const locations: OpLocation[] = [
    { id: 1, osm_id: 111, osm_type: 'NODE', osm_name: 'Migros', osm_brand: 'Migros', osm_lat: 46.93, osm_lon: 7.12, osm_address_city: 'Murten' },
    { id: 2, osm_id: 222, osm_type: 'WAY', osm_name: 'Coop', osm_brand: 'Coop', osm_lat: 46.99, osm_lon: 6.93 },
    { id: 3, osm_id: 333, osm_type: 'NODE', osm_name: 'Migrolino', osm_brand: 'Migrolino' },
  ];
  const product = { product_name: 'Huile de colza', product_quantity: 1000, product_quantity_unit: 'ml', labels_tags: ['en:made-in-swiss'] };
  const price = (o: Partial<OpPrice>): OpPrice => ({
    id: 1,
    type: 'PRODUCT',
    product_code: '7610000000004',
    price: 3.5,
    currency: 'CHF',
    date: '2026-09-20',
    location_id: 1,
    proof: { type: 'RECEIPT' },
    product,
    ...o,
  });

  it('associe les lieux aux enseignes du périmètre', () => {
    expect(locations.map(chainForLocation)).toEqual(['migros', 'coop', null]);
  });

  it('garde licence, lieu et justificatif ; généralise selon la politique tarifaire', () => {
    const batch = buildOpenPricesBatch(
      locations,
      [
        price({ id: 1 }),
        price({ id: 2, location_id: 2, proof: { type: 'PRICE_TAG' } }),
        price({ id: 3, duplicate_of: 1 }),
        price({ id: 4, currency: 'EUR' }),
        price({ id: 5, price_is_discounted: true, price: 2.9, price_without_discount: null }),
        price({ id: 6, date: '2024-01-01' }),
        price({ id: 7, location_id: 3 }),
      ],
      {
        now,
        stores: [],
        maxAgeDays: 400,
        resolveZone: (chain) => (chain === 'migros' ? 'migros-nf' : null),
      },
    );
    expect(batch.prices.map((p) => p.id)).toEqual(['open-prices:1', 'open-prices:2']);
    expect(batch.prices[0]).toMatchObject({
      retailerProductId: 'migros:gtin-7610000000004',
      zoneId: 'migros-nf',
      reliability: 'crowd',
      license: 'ODbL-1.0',
      proof: 'receipt',
      observedAtPlace: 'Migros, Murten',
    });
    expect(batch.prices[1]).toMatchObject({ retailerProductId: 'coop:gtin-7610000000004', zoneId: null, proof: 'price_tag' });
    expect(batch.retailerProducts[0]?.attributes.swissOrigin).toBe(true);
    expect(batch.report.metrics?.['skipped: doublon signalé']).toBe(1);
  });
});

describe('correspondances revues et instantanés', () => {
  it('une décision revue prime sur les suggestions', () => {
    const milk = PRODUCTS.find((p) => p.slug === 'lait-entier-uht-1l')!;
    const rp = {
      id: 'lidl:1',
      chainId: 'lidl',
      connectorId: 'lidl-web',
      sku: '1',
      name: 'Vollmilch UHT',
      quantity: { amount: 1000, unit: 'ml' as const },
      attributes: { organic: false, swissOrigin: true, labels: [] },
      isDemo: false,
    };
    const reviewed = [{ retailerProductId: 'lidl:1', canonicalSlug: milk.slug, reviewer: 'test', reviewedAt: '2026-09-28' }];
    const { matches } = matchesFor([rp], PRODUCTS, reviewed);
    expect(matches).toEqual([{ canonicalId: milk.id, retailerProductId: 'lidl:1', kind: 'equivalent', status: 'validated', confidence: 1 }]);
    const refused = matchesFor([rp], PRODUCTS, [{ ...reviewed[0]!, canonicalSlug: null }]);
    expect(refused.matches).toEqual([]);
  });

  it('fusionne sans doublon et oublie les prix trop anciens', () => {
    const now = new Date('2026-09-28T08:00:00Z');
    const obs = (id: string, at: string) => ({
      id,
      retailerProductId: 'lidl:1',
      zoneId: null,
      storeId: null,
      priceCents: 100,
      observedAt: at,
      source: { connectorId: 'lidl-web', kind: 'retailer_site' as const },
      isDemo: false,
    });
    const product = { id: 'lidl:1', chainId: 'lidl', connectorId: 'lidl-web', sku: '1', name: 'x', quantity: { amount: 1, unit: 'piece' as const }, attributes: { organic: false, swissOrigin: false, labels: [] }, isDemo: false };
    const merged = mergeLiveBatch(
      { retailerProducts: [product], prices: [obs('a', '2026-09-27T08:00:00Z'), obs('old', '2026-05-01T08:00:00Z')], promotions: [] },
      { retailerProducts: [product], prices: [obs('a', '2026-09-28T08:00:00Z'), obs('b', '2026-09-28T08:00:00Z')], promotions: [] },
      now,
    );
    expect(merged.prices.map((p) => p.id).sort()).toEqual(['a', 'b']);
    expect(merged.prices.find((p) => p.id === 'a')?.observedAt).toBe('2026-09-28T08:00:00Z');
    expect(merged.retailerProducts).toHaveLength(1);
  });
});

describe('contrôles de collecte', () => {
  it('alerte sur une extraction vide ou une chute de volume', () => {
    expect(checkCollection({ connectorId: 'x', products: 0, prices: 0, promotions: 0 }, null).map((a) => a.kind)).toEqual(['parse_drift']);
    expect(
      checkCollection({ connectorId: 'x', products: 50, prices: 40, promotions: 0 }, { connectorId: 'x', products: 100, prices: 100, promotions: 0 }).map(
        (a) => a.kind,
      ),
    ).toEqual(['coverage_drop']);
    expect(checkCollection({ connectorId: 'x', products: 100, prices: 95, promotions: 0 }, { connectorId: 'x', products: 100, prices: 100, promotions: 0 })).toEqual([]);
  });
});

describe('Lidl : actions conditionnelles (phase 4)', () => {
  it('classe la mécanique d’après le bandeau et la contenance', () => {
    expect(offerMechanic('-50% sur le 2e paquet', '200 g')).toEqual({ type: 'nth_percent', buyQty: 2, percent: 50 });
    expect(offerMechanic('Dès', 'Diverses sortes | 250-500 ml |')).toEqual({ type: 'conditional' });
    expect(offerMechanic('Jusqu’à -46%', '750-1000 ml |')).toEqual({ type: 'conditional' });
    expect(offerMechanic('Action', 'env. 400-700 g | 100 g = 2.79 |')).toEqual({ type: 'conditional' });
    // « 2+1 gratuit » : le prix affiché est celui du lot de 3 vendu comme un article.
    expect(offerMechanic('2+1 gratuit', 'Bœuf, poulet | 3 x 2 kg | 1 kg = 2.82 |')).toEqual({ type: 'price' });
    expect(offerMechanic('2+1 gratuit', '2 kg |')).toEqual({ type: 'conditional' });
    expect(offerMechanic('-20%', '1 l |')).toEqual({ type: 'price' });
    expect(offerMechanic(null, '6 x 1,5 l |')).toEqual({ type: 'price' });
  });

  it('« -50% sur le 2e paquet » : jamais un prix unitaire à 0.89 ; prix normal conservé', () => {
    const now = new Date('2026-09-28T08:00:00Z');
    const html = [
      gridItem({
        erpNumber: '200',
        fullTitle: 'Saucisses de Vienne',
        storeStartDate: 1790805600,
        storeEndDate: 1791410399,
        price: { price: 0.89, oldPrice: 1.79, discount: { discountText: '-50% sur le 2e paquet', deletedPrice: 1.79, percentageDiscount: 50 } },
        keyfacts: { description: '<ul><li>200 g</li><li>100 g = 0.45</li><li>Prix unitaire = 1.79</li></ul>' },
      }),
      gridItem({
        erpNumber: '201',
        fullTitle: 'Lait de coco',
        storeStartDate: 1790805600,
        storeEndDate: 1791410399,
        price: { price: 2.19, oldPrice: 0, discount: { discountText: 'Dès' } },
        keyfacts: { description: '<ul><li>Diverses sortes</li><li>250-500 ml</li></ul>' },
      }),
    ].join('\n');
    const batch = buildLidlBatch({ assortment: [], offers: [{ url: 'https://www.lidl.ch/c/fr-CH/x/a1', html, fetchedAt: now }] }, { now });
    const nth = batch.promotions.find((p) => p.retailerProductId === 'lidl:offer-200')!;
    expect(nth).toMatchObject({ type: 'nth_percent', buyQty: 2, percent: 50, promoPriceCents: null, referencePriceCents: 179 });
    expect(batch.prices.find((o) => o.retailerProductId === 'lidl:offer-200')?.priceCents).toBe(179);
    expect(batch.promotions.find((p) => p.retailerProductId === 'lidl:offer-201')?.type).toBe('conditional');
    expect(batch.report.metrics?.conditionalOffers).toBe(2);
  });
});
