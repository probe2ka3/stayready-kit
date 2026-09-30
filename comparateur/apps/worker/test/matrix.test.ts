import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { LiveSnapshot } from '@cabas/connectors';
import type { RetailerProduct } from '@cabas/core';
import { buildEssentialsMatrix, matrixMarkdown, publicPage, redactPrivate } from '../src/matrix';

// Données fictives : vérifient le classement des sources, pas des prix réels.
const now = new Date('2026-09-30T10:00:00Z');
const product = (chainId: string, connectorId: string, sku: string, name: string): RetailerProduct => ({
  id: `${chainId}:${sku}`,
  chainId,
  connectorId,
  sku,
  name,
  quantity: { amount: 500, unit: 'g' },
  attributes: { organic: false, swissOrigin: false, labels: [] },
  isDemo: false,
  declaredSlug: 'spaghetti-500g',
});
const snapshot = (connectorId: string, p: RetailerProduct, cents: number, observedAt: string, kind: 'retailer_site' | 'open_data'): LiveSnapshot => ({
  connectorId,
  label: connectorId,
  license: null,
  attribution: null,
  collectedAt: now.toISOString(),
  status: 'success',
  message: null,
  metrics: {},
  batch: {
    retailerProducts: [p],
    prices: [{ id: `${p.id}:1`, retailerProductId: p.id, zoneId: null, storeId: null, priceCents: cents, observedAt, source: { connectorId, kind, ref: 't' }, isDemo: false }],
    promotions: [],
  },
});

describe('matrice des essentiels', () => {
  const snaps = [
    snapshot('lidl-web', product('lidl', 'lidl-web', 'a', 'Spaghetti Lidl'), 99, '2026-09-30T08:00:00Z', 'retailer_site'),
    snapshot('aldi-api', product('aldi', 'aldi-api', 'b', 'Spaghetti Aldi secret'), 89, '2026-09-30T08:00:00Z', 'retailer_site'),
    snapshot('open-prices', product('coop', 'open-prices', 'c', 'Spaghetti Coop'), 120, '2026-06-01T10:00:00Z', 'open_data'),
  ];
  const m = buildEssentialsMatrix(snaps, [], now);
  const row = m.rows.find((r) => r.slug === 'spaghetti-500g')!;

  it('classe chaque source : publique, privée, trop ancienne, absente', () => {
    expect(row.cells.lidl).toMatchObject({ status: 'official_public', totalCents: 99 });
    expect(row.cells.aldi).toMatchObject({ status: 'private_only', totalCents: 89 });
    expect(row.cells.coop?.status).toBe('stale');
    expect(row.cells.migros?.status).toBe('missing');
    expect(row).toMatchObject({ publicChains: 1, privateChains: 2 });
    expect(m.summary.comparablePublic['2']).toBe(0);
    expect(m.summary.comparablePrivate['2']).toBe(1);
    expect(matrixMarkdown(m)).toContain('Pilote privé (avec Aldi et Denner)');
  });

  it('la page publique ne contient jamais de donnée privée', async () => {
    const template = await readFile(join(__dirname, '../../../data/public/template.html'), 'utf8');
    const html = publicPage(template, m);
    expect(html).toContain('Spaghetti Lidl');
    expect(html).not.toContain('Spaghetti Aldi secret');
    expect(html).not.toContain('aldi-api');
    expect(html).not.toContain('"total":89');
  });

  it('la matrice versionnée ne garde que le statut des sources non publiables', () => {
    const r = redactPrivate(m);
    const cell = r.rows.find((x) => x.slug === 'spaghetti-500g')!.cells.aldi!;
    expect(cell).toMatchObject({ status: 'private_only', totalCents: null, productName: null, observedAt: null, unitPrice: null });
    expect(JSON.stringify(r)).not.toContain('Spaghetti Aldi secret');
    expect(matrixMarkdown(r)).toContain('collecté, non publiable');
    expect(r.rows.find((x) => x.slug === 'spaghetti-500g')!.cells.lidl!.totalCents).toBe(99);
  });
});
