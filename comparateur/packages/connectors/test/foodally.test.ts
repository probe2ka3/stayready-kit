import { describe, expect, it } from 'vitest';
import { buildOfferIndex } from '@cabas/core';
import {
  buildFoodAllyBatch,
  FOODALLY_MCP_URL,
  HttpBlockedError,
  parseSearchResponse,
  PoliteFetcher,
  runFoodAllyQueries,
  searchRequest,
  type FoodAllyResult,
} from '../src';

const NOW = new Date('2026-09-30T08:00:00Z');
const results: FoodAllyResult[] = [
  { id: 1, name: 'Penne Rigate', vendor: 'Lidl', priceCHF: 1.19, quantity: '1kg', unitPriceCHF: 1.19, unitPriceUnit: 'kg', url: 'https://foodally.ch/product/1-Lidl-Penne' },
  { id: 2, name: 'Barilla Penne Rigate', vendor: 'Coop', priceCHF: 2.6, quantity: '500g', url: 'https://foodally.ch/product/2-Coop-Penne' },
  { id: 3, name: 'Penne Rigate N°73 Barilla 5 kg', vendor: 'Aligro', priceCHF: 11.2, quantity: '5kg', url: 'https://foodally.ch/product/3' },
  { id: 4, name: 'enerBiO Dinkel Penne', vendor: 'Rossmann', priceCHF: 1.49, quantity: '500g', url: 'https://foodally.ch/product/4' },
  { id: 5, name: 'Penne sans taille', vendor: 'Migros', priceCHF: 1.5, quantity: null, url: 'https://foodally.ch/product/5' },
];
const body = (r: FoodAllyResult[]) => JSON.stringify({ jsonrpc: '2.0', id: 1, result: { structuredContent: { results: r, total: r.length } } });

describe('FoodAlly (fournisseur tiers, comparaison)', () => {
  it('formule une requête JSON-RPC search_products limitée aux enseignes suivies', () => {
    const req = JSON.parse(searchRequest('Penne', 7));
    expect(req).toMatchObject({ jsonrpc: '2.0', id: 7, method: 'tools/call', params: { name: 'search_products', arguments: { query: 'Penne', limit: 40 } } });
    expect(req.params.arguments.vendors).toEqual(['migros', 'coop', 'lidl', 'aldi', 'denner']);
  });

  it('garde la provenance tiers, le lien d’attribution et n’en fait que des suggestions', () => {
    const { results: r } = parseSearchResponse(body(results));
    const batch = buildFoodAllyBatch([{ slug: 'penne-500g', query: 'Penne', results: r, total: 5, fetchedAt: NOW }]);
    // Vendeurs hors périmètre (Rossmann) ignorés ; contenance absente → ignoré.
    expect(batch.retailerProducts.map((p) => p.id).sort()).toEqual(['aligro:fa-3', 'coop:fa-2', 'lidl:fa-1']);
    const lidl = batch.prices.find((o) => o.retailerProductId === 'lidl:fa-1')!;
    expect(lidl).toMatchObject({
      priceCents: 119,
      reliability: 'third_party',
      channel: 'online',
      sourceUrl: 'https://foodally.ch/product/1-Lidl-Penne',
      source: { connectorId: 'foodally', kind: 'third_party' },
    });
    expect(batch.matches.every((m) => m.status === 'suggested')).toBe(true);
    // Un paquet de 5 kg (10 fois la référence) n'est pas une correspondance plausible.
    expect(batch.matches.map((m) => m.retailerProductId).sort()).toEqual(['coop:fa-2', 'lidl:fa-1']);
    // Jamais utilisé pour un prix affiché par défaut.
    const index = buildOfferIndex({ products: batch.retailerProducts, matches: batch.matches.map((m) => ({ ...m, status: 'validated' as const })), prices: batch.prices, promotions: [] });
    expect(index.pricesByProduct.size).toBe(0);
  });

  it('respecte le quota annoncé et s’arrête au premier refus (402)', async () => {
    let calls = 0;
    const fetchImpl = (async (url: string, init?: RequestInit) => {
      if (url.endsWith('/robots.txt')) return new Response('User-agent: *\nAllow: /mcp\nDisallow: /\n', { status: 200 });
      calls++;
      expect(init?.method).toBe('POST');
      const left = 13 - calls;
      return new Response(body(results.slice(0, 1)), { status: 200, headers: { 'content-type': 'application/json', 'x-ratelimit-remaining-day': String(left) } });
    }) as unknown as typeof fetch;
    const fetcher = new PoliteFetcher({ userAgent: 'TesPrixBot/0.1 (test)', fetchImpl, sleep: async () => {}, archiveDir: null });
    const items = Array.from({ length: 10 }, (_, i) => ({ slug: 'penne-500g', query: `q${i}` }));
    const run = await runFoodAllyQueries(fetcher, items, { dailyReserve: 10 });
    expect(run.queries).toHaveLength(3);
    expect(run.stoppedBy).toMatch(/réserve quotidienne/);

    const quota = (async (url: string) =>
      url.endsWith('/robots.txt') ? new Response('', { status: 404 }) : new Response('payment required', { status: 402 })) as unknown as typeof fetch;
    const f2 = new PoliteFetcher({ userAgent: 'TesPrixBot/0.1 (test)', fetchImpl: quota, sleep: async () => {}, archiveDir: null });
    await expect(runFoodAllyQueries(f2, items)).rejects.toMatchObject({ reason: 'quota' });
    await expect(f2.post(FOODALLY_MCP_URL, '{}')).rejects.toBeInstanceOf(HttpBlockedError);
  });

  it('n’utilise que le point d’accès autorisé par robots.txt', async () => {
    const fetchImpl = (async (url: string) =>
      url.endsWith('/robots.txt') ? new Response('User-agent: *\nAllow: /mcp\nDisallow: /\n', { status: 200 }) : new Response('{}')) as unknown as typeof fetch;
    const fetcher = new PoliteFetcher({ userAgent: 'TesPrixBot/0.1 (test)', fetchImpl, sleep: async () => {}, archiveDir: null });
    await expect(fetcher.post('https://foodally.ch/api/v2/products', '{}')).rejects.toMatchObject({ reason: 'robots' });
  });
});
