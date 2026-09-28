import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { buildPriceRecords, coverageKpis, dataQualityReport, DEFAULT_FRESHNESS } from '@cabas/core';
import { readLiveDataSet } from '@cabas/connectors';
import { CHAINS, PRODUCTS } from '@cabas/reference';
import type { JobContext } from './jobs';

/**
 * Rapport du moteur de données (`data-report [--out dossier]`) : couverture par enseigne,
 * références comparables, fraîcheur, contrôle de qualité et volume d'observations enrichies.
 * Écrit `data/quality/report.json` (détail, hors dépôt) et `data/quality/summary.json` (versionné).
 */
export async function jobDataReport(ctx: JobContext) {
  const { data, health } = await readLiveDataSet(ctx.env.dataDir, PRODUCTS);
  const chainIds = CHAINS.map((c) => c.id);
  const coverage = coverageKpis(data, PRODUCTS, chainIds, ctx.now, DEFAULT_FRESHNESS);
  const quality = dataQualityReport(data, PRODUCTS, health, ctx.now, DEFAULT_FRESHNESS);
  const records = buildPriceRecords(data, ctx.now, DEFAULT_FRESHNESS);
  const byTier: Record<string, number> = {};
  for (const r of records) byTier[r.sourceType] = (byTier[r.sourceType] ?? 0) + 1;

  const outDir = typeof ctx.flags.out === 'string' ? ctx.flags.out : join(ctx.env.dataDir, 'quality');
  await mkdir(outDir, { recursive: true });
  const summary = {
    at: ctx.now.toISOString(),
    catalogSize: coverage.catalogSize,
    comparable: coverage.comparable,
    freshness: coverage.freshness,
    chains: coverage.chains,
    byPriority: coverage.byPriority ?? null,
    records: { total: records.length, byTier },
    quality: quality.counts,
    connectors: health,
  };
  await writeFile(join(outDir, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`);
  await writeFile(join(outDir, 'report.json'), `${JSON.stringify({ coverage, quality }, null, 1)}\n`);
  if (!ctx.flags.quiet) {
    console.table(
      coverage.chains.map((c) => ({
        enseigne: c.chainId,
        references: c.references,
        officielles: c.referencesFirstParty,
        articles: c.products,
        'avec prix': c.pricedProducts,
        '<24h': c.fresh24h,
        '<48h': c.fresh48h,
        '<7j': c.fresh7d,
        '>7j': c.older,
      })),
    );
    console.table([{ '≥2': coverage.comparable['2'], '≥3': coverage.comparable['3'], '≥4': coverage.comparable['4'], '≥5': coverage.comparable['5'] }]);
    console.table([quality.counts]);
  }
  ctx.log.info('Rapport de données écrit', { dir: outDir, records: records.length, issues: quality.issues.length });
}
