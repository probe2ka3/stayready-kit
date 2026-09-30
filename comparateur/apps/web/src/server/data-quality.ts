import 'server-only';
import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import {
  coverageKpis,
  dataQualityReport,
  DEFAULT_FRESHNESS,
  sourceInfo,
  type CoverageKpis,
  type QualityReport,
} from '@cabas/core';
import { liveSnapshotDir, privateSnapshotDir, readLiveDataSet, reviewedMatchesPath } from '@cabas/connectors';
import { CHAINS, PRODUCTS } from '@cabas/reference';
import { serverEnv } from './env';

export interface SourceSummary {
  connectorId: string;
  provider: string;
  tier: string;
  collectedAt: string | null;
  status: string;
  products: number;
  prices: number;
  promotions: number;
  license: string | null;
  benchmarkOnly: boolean;
}

export interface DataQualityView {
  coverage: CoverageKpis;
  quality: QualityReport;
  sources: SourceSummary[];
}

let cache: { key: string; at: number; view: DataQualityView } | null = null;

function cacheKey(): string {
  const files = ['lidl-web', 'aldi-api', 'denner-web', 'open-prices', 'releves', 'foodally'].flatMap((id) =>
    [liveSnapshotDir(serverEnv.dataDir), privateSnapshotDir(serverEnv.dataDir)].map((dir) => join(dir, `${id}.json`)),
  );
  return [...files, reviewedMatchesPath(serverEnv.dataDir)]
    .map((p) => {
      try {
        return statSync(p).mtimeMs;
      } catch {
        return '-';
      }
    })
    .join('|');
}

/**
 * Couverture, fraîcheur et contrôle de qualité, calculés à partir des instantanés de collecte
 * (`data/prices/live/`) et des correspondances revues. Mis en cache 10 minutes ou jusqu'à la
 * prochaine collecte.
 */
export async function dataQualityView(now = new Date()): Promise<DataQualityView> {
  const key = cacheKey();
  if (cache && cache.key === key && now.getTime() - cache.at < 600_000) return cache.view;
  const { data, health, snapshots } = await readLiveDataSet(serverEnv.dataDir, PRODUCTS, { includeBenchmark: true });
  const benchmark = new Set(snapshots.filter((s) => sourceInfo({ connectorId: s.connectorId, kind: 'retailer_site' }).benchmarkOnly).map((s) => s.connectorId));
  // Couverture et qualité : uniquement les sources utilisables pour les prix affichés.
  const shown = {
    products: data.products.filter((p) => !benchmark.has(p.connectorId)),
    matches: data.matches,
    prices: data.prices.filter((o) => !benchmark.has(o.source.connectorId)),
    promotions: data.promotions.filter((p) => !benchmark.has(p.source.connectorId)),
  };
  const view: DataQualityView = {
    coverage: coverageKpis(shown, PRODUCTS, CHAINS.map((c) => c.id), now, DEFAULT_FRESHNESS),
    quality: dataQualityReport(shown, PRODUCTS, health.filter((h) => !benchmark.has(h.connectorId)), now, DEFAULT_FRESHNESS),
    sources: snapshots.map((s) => {
      const info = sourceInfo({ connectorId: s.connectorId, kind: 'retailer_site' });
      return {
        connectorId: s.connectorId,
        provider: info.provider,
        tier: info.tier,
        collectedAt: s.collectedAt,
        status: s.status,
        products: s.batch.retailerProducts.length,
        prices: s.batch.prices.length,
        promotions: s.batch.promotions.length,
        license: s.license ?? info.license,
        benchmarkOnly: Boolean(info.benchmarkOnly),
      };
    }),
  };
  cache = { key, at: now.getTime(), view };
  return view;
}

/** Résumé d'une source dans le journal de la collecte quotidienne (`pnpm job quotidien`). */
export interface DailyRunSource {
  connector: string;
  status: string;
  message?: string | null;
  requests: number;
  products: number;
  prices: number;
  promotions: number;
  durationMs: number;
  collectedAt: string | null;
  budgetExhausted?: boolean;
}

export interface DailyRunView {
  date: string;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  requests: number;
  ok: boolean;
  sources: DailyRunSource[];
  steps: Array<{ step: string; ok: boolean; durationMs: number; message?: string }>;
  chains: Array<{ chainId: string; automatic: string; coreNeedsPriced: number; coreNeedsToday: number; newestObservation: string | null; promotionsActive: number; promotionsEndUnknown: number }>;
  validation: { checked: number; passed: number; failures: number } | null;
}

/** Dernier journal de la collecte quotidienne (`data/private/runs/latest.json`), null s'il n'y en a pas. */
export function latestDailyRun(): DailyRunView | null {
  try {
    return JSON.parse(readFileSync(join(serverEnv.dataDir, 'private', 'runs', 'latest.json'), 'utf8')) as DailyRunView;
  } catch {
    return null;
  }
}
