import { describe, expect, it } from 'vitest';
import {
  AldiApiConnector,
  aldiSearchUrl,
  buildAldiBatch,
  chfToCents,
  comparisonAsBasis,
  HttpBlockedError,
  isGroceryItem,
  PoliteFetcher,
  type AldiApiItem,
  type AldiApiPage,
} from '../src';

const NOW = new Date('2026-09-28T06:00:00Z');

function item(over: Partial<AldiApiItem> & { sku: string; name: string }): AldiApiItem {
  return {
    brandName: null,
    urlSlugText: `slug-${over.sku}`,
    discontinued: false,
    sellingSize: '500 g',
    onSaleDate: null,
    onSaleDateDisplay: null,
    price: { amount: 199, amountRelevant: 199, comparison: 40, comparisonDisplay: 'CHF 0.40/100 g', wasPriceDisplay: null, currencyCode: 'CHF' },
    categories: [{ id: '1588161418433057', name: 'Provisions' }],
    badges: [],
    ...over,
  };
}

function page(items: AldiApiItem[], total = items.length): AldiApiPage {
  return { meta: { pagination: { offset: 0, limit: 60, totalCount: total } }, data: items };
}

const input = (items: AldiApiItem[], total?: number) => ({
  pages: [{ url: aldiSearchUrl(0), json: page(items, total), fetchedAt: NOW }],
});

describe('Aldi Suisse — API publique de recherche', () => {
  it('lit les montants et le prix de base affichés', () => {
    expect(chfToCents('CHF 3.79')).toBe(379);
    expect(chfToCents(null)).toBeNull();
    expect(comparisonAsBasis('CHF 0.44/100 g')).toBe('100 g = 0.44');
    expect(comparisonAsBasis('CHF 2.65/1 l')).toBe('1 l = 2.65');
    expect(comparisonAsBasis('CHF 12.90/kg')).toBe('1 kg = 12.90');
    expect(comparisonAsBasis('CHF 0.20/1 Pièce')).toBeNull();
  });

  it('écarte les actions non alimentaires mais garde le ménage', () => {
    expect(isGroceryItem(item({ sku: '1', name: 'Veste', categories: [{ id: '1588161418433031', name: 'Actions' }, { id: '158816141843303104', name: 'Vêtements et accessoires' }] }))).toBe(false);
    expect(isGroceryItem(item({ sku: '2', name: 'Lessive', categories: [{ id: '1588161418433031', name: 'Actions' }, { id: '158816141843303133', name: 'Lessives et entretien des textiles' }] }))).toBe(true);
    expect(isGroceryItem(item({ sku: '3', name: 'Inconnu', categories: [{ id: '1588161418433031', name: 'Actions' }] }))).toBe(true);
  });

  it('prix permanent : observation officielle nationale, en magasin', () => {
    const b = buildAldiBatch(input([item({ sku: '000000000000100049', name: 'Pâtes Penne', sellingSize: '500 g' })]), { now: NOW });
    expect(b.retailerProducts[0]).toMatchObject({ id: 'aldi:100049', chainId: 'aldi', quantity: { amount: 500, unit: 'g' }, gtin: null });
    expect(b.retailerProducts[0]?.url).toBe('https://www.aldi-suisse.ch/fr/produit/slug-000000000000100049-000000000000100049');
    expect(b.prices).toHaveLength(1);
    expect(b.prices[0]).toMatchObject({ priceCents: 199, zoneId: null, reliability: 'official', channel: 'store', priceType: 'regular', proof: 'public_api' });
    expect(b.promotions).toHaveLength(0);
  });

  it('réduction « au lieu de » : action datée + dernier prix normal, jamais un prix normal au prix réduit', () => {
    const b = buildAldiBatch(
      input([item({ sku: '7', name: 'Émincé de poulet', sellingSize: '0,6 kg', price: { amount: 299, amountRelevant: 299, comparisonDisplay: 'CHF 4.98/1 kg', wasPriceDisplay: 'CHF 3.79', savingsDisplay: '-21%' } })]),
      { now: NOW },
    );
    expect(b.promotions[0]).toMatchObject({ promoPriceCents: 299, referencePriceCents: 379, validFrom: '2026-09-28', endIsPresumed: true, whileStocksLast: true, label: '-21%' });
    expect(b.prices).toHaveLength(1);
    expect(b.prices[0]?.priceCents).toBe(379);
  });

  it('action annoncée à l’avance : valable à partir de la date publiée, jamais avant', () => {
    const b = buildAldiBatch(
      input([item({ sku: '8', name: 'Raclette', onSaleDate: '2026-10-05', onSaleDateDisplay: 'Disponible à partir du 05.10.2026', categories: [{ id: '1588161418433031', name: 'Actions' }] })]),
      { now: NOW },
    );
    expect(b.prices).toHaveLength(0);
    expect(b.promotions[0]).toMatchObject({ validFrom: '2026-10-05', validTo: '2026-10-11', referencePriceCents: null, label: 'Action Aldi' });
    expect(b.report.metrics?.futureActions).toBe(1);
  });

  it('action en cours depuis plus de 6 jours : encore valable le jour du relevé', () => {
    const b = buildAldiBatch(
      input([item({ sku: '9', name: 'Chips', onSaleDate: '2026-09-14', categories: [{ id: '1588161418433031', name: 'Actions' }] })]),
      { now: NOW },
    );
    expect(b.promotions[0]).toMatchObject({ validFrom: '2026-09-14', validTo: '2026-09-28' });
  });

  it('multipack et contenance : prix du lot, jamais attribué à l’unité', () => {
    const b = buildAldiBatch(
      input([item({ sku: '10', name: 'Eau minérale', sellingSize: '6 x 1,5 l', price: { amount: 330, amountRelevant: 330, comparisonDisplay: 'CHF 0.37/1 l' } })]),
      { now: NOW },
    );
    expect(b.retailerProducts[0]?.quantity).toEqual({ amount: 9000, unit: 'ml' });
    expect(b.prices[0]?.priceCents).toBe(330);
  });

  it('rejette un prix incohérent avec le prix de base publié (quantité mal lue)', () => {
    const b = buildAldiBatch(
      input([item({ sku: '11', name: 'Riz', sellingSize: '1 kg', price: { amount: 199, amountRelevant: 199, comparisonDisplay: 'CHF 0.40/100 g' } })]),
      { now: NOW },
    );
    expect(b.prices).toHaveLength(0);
    expect(b.report.rejected[0]?.message).toMatch(/Prix de base incohérent/);
  });

  it('doublons de pagination ignorés, pagination incomplète signalée', () => {
    const a = item({ sku: '12', name: 'Lait entier', sellingSize: '1 l', price: { amount: 145, amountRelevant: 145, comparisonDisplay: 'CHF 1.45/1 l' } });
    const b = buildAldiBatch(
      { pages: [{ url: aldiSearchUrl(0), json: page([a], 10), fetchedAt: NOW }, { url: aldiSearchUrl(60), json: page([a], 10), fetchedAt: NOW }] },
      { now: NOW },
    );
    expect(b.retailerProducts).toHaveLength(1);
    expect(b.report.metrics?.duplicates).toBe(1);
    expect(b.report.warnings.some((w) => /Pagination incomplète/.test(w.message))).toBe(true);
  });

  it('articles sans prix ou retirés : ignorés sans créer de prix', () => {
    const b = buildAldiBatch(
      input([
        item({ sku: '13', name: 'Sans prix', price: { amount: null, amountRelevant: null } }),
        item({ sku: '14', name: 'Retiré', discontinued: true }),
      ]),
      { now: NOW },
    );
    expect(b.prices).toHaveLength(0);
    expect(b.retailerProducts).toHaveLength(0);
  });

  it('collecte : liste paginée jusqu’au total annoncé, arrêt immédiat sur refus', async () => {
    const calls: string[] = [];
    const fetchImpl = (async (url: string) => {
      calls.push(url);
      if (url.endsWith('/robots.txt')) return new Response('not found', { status: 404 });
      const offset = Number(new URL(url).searchParams.get('offset'));
      const items = offset === 0 ? [item({ sku: '20', name: 'Farine' })] : offset === 60 ? [item({ sku: '21', name: 'Sucre' })] : [];
      return new Response(JSON.stringify(page(items, 120)), { status: 200, headers: { 'content-type': 'application/json' } });
    }) as unknown as typeof fetch;
    const fetcher = new PoliteFetcher({ userAgent: 'TesPrixBot/0.1 (test)', fetchImpl, sleep: async () => {}, archiveDir: null });
    const batch = await new AldiApiConnector().run({ now: NOW, log: { info() {}, warn() {}, error() {} }, fetcher });
    expect(batch.retailerProducts.map((p) => p.id).sort()).toEqual(['aldi:20', 'aldi:21']);
    expect(calls.filter((u) => u.includes('product-search'))).toHaveLength(2);
    expect(calls.every((u) => !u.includes('q='))).toBe(true);

    const blocked = (async (url: string) =>
      url.endsWith('/robots.txt') ? new Response('', { status: 404 }) : new Response('Access Denied', { status: 403 })) as unknown as typeof fetch;
    const f2 = new PoliteFetcher({ userAgent: 'TesPrixBot/0.1 (test)', fetchImpl: blocked, sleep: async () => {}, archiveDir: null });
    await expect(new AldiApiConnector().run({ now: NOW, log: { info() {}, warn() {}, error() {} }, fetcher: f2 })).rejects.toBeInstanceOf(HttpBlockedError);
  });

  it('peut être désactivé immédiatement', async () => {
    expect((await new AldiApiConnector().status({ env: { ALDI_API: 'off' } })).state).toBe('disabled');
  });
});
