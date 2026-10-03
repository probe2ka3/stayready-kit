import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  emptyReport,
  HttpBlockedError,
  silentLogger,
  type ConnectorBatch,
  type LiveSnapshot,
  type PriceConnector,
} from '@cabas/connectors';
import { jobCollect } from '../src/collect';
import type { JobContext } from '../src/jobs';

function connector(id: string, run: () => Promise<ConnectorBatch>): PriceConnector {
  return {
    id,
    label: id,
    chainIds: ['lidl'],
    sourceKind: 'retailer_site',
    status: async () => ({ state: 'ready', message: 'ok' }),
    run,
  };
}

const batch = (id: string): ConnectorBatch => ({
  connectorId: id,
  retailerProducts: [
    {
      id: 'lidl:1',
      chainId: 'lidl',
      connectorId: id,
      sku: '1',
      name: 'Séré maigre',
      quantity: { amount: 500, unit: 'g' },
      attributes: { organic: false, swissOrigin: true, labels: [] },
      isDemo: false,
    },
  ],
  matches: [],
  prices: [
    {
      id: `${id}:1:2026-09-28`,
      retailerProductId: 'lidl:1',
      zoneId: null,
      storeId: null,
      priceCents: 125,
      observedAt: '2026-09-28T08:00:00.000Z',
      source: { connectorId: id, kind: 'retailer_site' },
      isDemo: false,
    },
  ],
  promotions: [],
  report: emptyReport(),
});

describe('collecte : dégradation progressive', () => {
  let dir: string;
  let ctx: JobContext;
  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'tesprix-collect-'));
    ctx = {
      env: { databaseUrl: undefined, dataDir: dir, importDir: join(dir, 'imports'), overpassUrl: undefined, env: {} },
      now: new Date('2026-09-28T08:00:00Z'),
      flags: { 'no-archive': true, quiet: true },
      args: [],
      log: silentLogger,
    };
  });
  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('isole les échecs : une source en panne ou bloquée n’empêche pas les autres', async () => {
    const summary = await jobCollect(ctx, [
      connector('bloquee', async () => {
        throw new HttpBlockedError('https://exemple.ch/', 'forbidden', 403);
      }),
      connector('en-panne', async () => {
        throw new Error('délai dépassé');
      }),
      connector('saine', async () => batch('saine')),
    ]);
    expect(summary.map((s) => [s.connector, s.status])).toEqual([
      ['bloquee', 'blocked'],
      ['en-panne', 'failed'],
      ['saine', 'success'],
    ]);
    const ok = JSON.parse(await readFile(join(dir, 'private', 'live', 'saine.json'), 'utf8')) as LiveSnapshot;
    expect(ok.batch.prices).toHaveLength(1);
    const blocked = JSON.parse(await readFile(join(dir, 'private', 'live', 'bloquee.json'), 'utf8')) as LiveSnapshot;
    expect(blocked.status).toBe('blocked');
    expect(blocked.message).toContain('403');
  });

  it('conserve les données précédentes quand une source tombe en panne, sans doublon', async () => {
    await jobCollect(ctx, [connector('saine', async () => batch('saine'))]);
    await jobCollect({ ...ctx, now: new Date('2026-09-29T08:00:00Z') }, [
      connector('saine', async () => {
        throw new Error('site indisponible');
      }),
    ]);
    const snap = JSON.parse(await readFile(join(dir, 'private', 'live', 'saine.json'), 'utf8')) as LiveSnapshot;
    expect(snap.status).toBe('failed');
    // Une collecte échouée ne rajeunit jamais les données : date de la dernière collecte réussie conservée.
    expect(snap.collectedAt).toBe(ctx.now.toISOString());
    expect(snap.batch.prices[0]?.observedAt.slice(0, 10)).toBe('2026-09-28');
    // Le prix de la veille reste disponible (il vieillira et sera signalé comme tel), une seule fois.
    expect(snap.batch.prices.map((p) => p.id)).toEqual(['saine:1:2026-09-28']);
  });

  it('source relue en entier : un relevé que les règles n’acceptent plus disparaît à la collecte suivante', async () => {
    const complet = (run: () => Promise<ConnectorBatch>) => ({ ...connector('complete', run), completeRead: true });
    await jobCollect(ctx, [complet(async () => batch('complete'))]);
    // Le lendemain, la même source ne produit plus ce relevé (ex. attribution de lieu retirée).
    await jobCollect({ ...ctx, now: new Date('2026-09-29T08:00:00Z') }, [complet(async () => ({ ...batch('complete'), retailerProducts: [], prices: [] }))]);
    const snap = JSON.parse(await readFile(join(dir, 'private', 'live', 'complete.json'), 'utf8')) as LiveSnapshot;
    expect(snap.batch.prices).toEqual([]);
    // Une source fusionnée garderait ce prix de moins de 90 jours.
    await jobCollect(ctx, [connector('fusion', async () => batch('fusion'))]);
    await jobCollect({ ...ctx, now: new Date('2026-09-29T08:00:00Z') }, [connector('fusion', async () => ({ ...batch('fusion'), retailerProducts: [], prices: [] }))]);
    const fusion = JSON.parse(await readFile(join(dir, 'private', 'live', 'fusion.json'), 'utf8')) as LiveSnapshot;
    expect(fusion.batch.prices).toHaveLength(1);
  });

  it('collecte partielle : le statut dit combien de pages manquent et laquelle', async () => {
    const [s] = await jobCollect(ctx, [
      connector('pages', async () => ({
        ...batch('pages'),
        report: { ...emptyReport(), metrics: { pageFailures: 2, pageFailureSample: 'https://exemple.ch/a : HTTP 504' } },
      })),
    ]);
    expect(s?.status).toBe('partial');
    expect(s?.message).toBe('2 page(s) non lue(s) après nouvelle tentative (ex. https://exemple.ch/a : HTTP 504)');
  });
});
