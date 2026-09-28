import 'server-only';
import { isValidMetric, zurichToday, type UsageRow } from '@cabas/core';
import { incrementUsage, listUsage } from '@cabas/db';
import { getPostgresData } from './data';

/**
 * Compteurs d'usage anonymes (voir packages/core/src/metrics.ts). En mode mémoire, les
 * compteurs vivent le temps du processus ; avec PostgreSQL, table `usage_daily`.
 * Une erreur d'enregistrement n'affecte jamais la réponse à l'utilisateur.
 */
const memory = new Map<string, number>();

export function recordMetric(metric: string, dimension: string, n = 1, now = new Date()): void {
  if (!isValidMetric(metric, dimension)) return;
  const day = zurichToday(now);
  const pg = getPostgresData();
  if (pg) {
    void incrementUsage(pg.handle, day, metric, dimension, n).catch(() => {});
    return;
  }
  const key = `${day}|${metric}|${dimension}`;
  memory.set(key, (memory.get(key) ?? 0) + n);
}

export async function usageSince(fromDay: string): Promise<UsageRow[]> {
  const pg = getPostgresData();
  if (pg) return listUsage(pg.handle, fromDay);
  return [...memory.entries()]
    .map(([k, count]) => {
      const [day, metric, dimension] = k.split('|') as [string, string, string];
      return { day, metric, dimension, count };
    })
    .filter((r) => r.day >= fromDay);
}
