import { describe, expect, it } from 'vitest';
import type { CollectSummary } from '../src/collect';
import { sourcesToRun, type DailyRun } from '../src/daily-prices';

const all = ['open-prices', 'denner-web', 'aldi-api', 'lidl-web'];
const src = (connector: string, status: CollectSummary['status']): CollectSummary => ({
  connector,
  status,
  products: 0,
  prices: 0,
  promotions: 0,
  rejected: 0,
  anomalies: '-',
  requests: 0,
  cacheHits: 0,
  budgetExhausted: false,
  durationMs: 0,
  collectedAt: null,
});
const run = (date: string, sources: CollectSummary[]): DailyRun => ({
  date,
  startedAt: `${date}T04:00:00Z`,
  finishedAt: `${date}T04:15:00Z`,
  durationMs: 900_000,
  mode: 'noyau',
  sources,
  steps: [],
  chains: [],
  validation: null,
  requests: 0,
  ok: true,
});

describe('collecte quotidienne : une fois par jour, rattrapage ciblé', () => {
  it('première exécution du jour : toutes les sources', () => {
    expect(sourcesToRun(null, '2026-10-01', all, false)).toEqual(all);
    expect(sourcesToRun(run('2026-09-30', all.map((s) => src(s, 'success'))), '2026-10-01', all, false)).toEqual(all);
  });

  it('même jour : seules les sources en échec technique ou incomplètes sont reprises, jamais une source bloquée', () => {
    const today = run('2026-10-01', [src('open-prices', 'success'), src('denner-web', 'failed'), src('aldi-api', 'blocked'), src('lidl-web', 'partial')]);
    expect(sourcesToRun(today, '2026-10-01', all, false)).toEqual(['denner-web', 'lidl-web']);
  });

  it('même jour sans échec : rien à faire, sauf --force', () => {
    const today = run('2026-10-01', all.map((s) => src(s, 'success')));
    expect(sourcesToRun(today, '2026-10-01', all, false)).toEqual([]);
    expect(sourcesToRun(today, '2026-10-01', all, true)).toEqual(all);
  });
});
