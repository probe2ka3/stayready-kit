import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { addDays, ageInDays, sourceInfo, zurichToday, type CanonicalProduct, type ConnectorHealth, type DataSet } from '@cabas/core';
import { matchesFor, type ReviewedMatch, type ReviewedMatchesFile } from './matching';
import type { ConnectorBatch } from './types';

/**
 * Instantané des prix réels collectés (un fichier par connecteur dans
 * `data/prices/live/`). Sert au mode « mémoire » (sans base de données) et de trace
 * lisible de la dernière collecte. Ne contient jamais de données de démonstration.
 */
export interface LiveSnapshot {
  connectorId: string;
  label: string;
  license: string | null;
  attribution: string | null;
  collectedAt: string;
  status: 'success' | 'partial' | 'failed' | 'blocked';
  message: string | null;
  metrics: Record<string, number | string | boolean>;
  batch: Pick<ConnectorBatch, 'retailerProducts' | 'prices' | 'promotions'>;
}

export function liveSnapshotDir(dataDir: string): string {
  return join(dataDir, 'prices', 'live');
}

export async function readLiveSnapshots(dataDir: string): Promise<LiveSnapshot[]> {
  const dir = liveSnapshotDir(dataDir);
  if (!existsSync(dir)) return [];
  const files = (await readdir(dir)).filter((f) => f.endsWith('.json')).sort();
  const out: LiveSnapshot[] = [];
  for (const f of files) {
    const snap = JSON.parse(await readFile(join(dir, f), 'utf8')) as LiveSnapshot;
    // Garde-fou : aucune donnée de démonstration dans un instantané réel.
    snap.batch.retailerProducts = snap.batch.retailerProducts.filter((p) => !p.isDemo);
    snap.batch.prices = snap.batch.prices.filter((p) => !p.isDemo);
    snap.batch.promotions = snap.batch.promotions.filter((p) => !p.isDemo);
    out.push(snap);
  }
  return out;
}

/**
 * Fusionne une nouvelle collecte avec l'instantané précédent : les prix non relus
 * sont conservés tant qu'ils ont moins de `keepDays` jours (ils vieillissent et
 * deviennent « indicatifs » puis « périmés »), les promotions tant qu'elles sont valables.
 */
export function mergeLiveBatch(
  previous: LiveSnapshot['batch'] | null,
  next: LiveSnapshot['batch'],
  now: Date,
  keepDays = 90,
): LiveSnapshot['batch'] {
  if (!previous) return next;
  const today = zurichToday(now);
  const prices = new Map(previous.prices.filter((p) => ageInDays(p.observedAt, now) <= keepDays).map((p) => [p.id, p]));
  for (const p of next.prices) prices.set(p.id, p);
  const promotions = new Map(previous.promotions.filter((p) => p.validTo >= addDays(today, -1)).map((p) => [p.id, p]));
  for (const p of next.promotions) promotions.set(p.id, p);
  // Fin présumée démentie : l'enseigne affiche aujourd'hui le même prix comme prix normal, sans action.
  // L'action est close à la veille (le prix devient un prix normal), au lieu de courir jusqu'à la fin
  // supposée : jamais deux statuts contradictoires pour le même prix.
  const promotedToday = new Set(next.promotions.filter((p) => p.validFrom <= today && p.validTo >= today).map((p) => p.retailerProductId));
  const regularToday = new Map<string, number>();
  for (const o of next.prices) if ((o.priceType ?? 'regular') === 'regular' && zurichToday(new Date(o.observedAt)) === today) regularToday.set(o.retailerProductId, o.priceCents);
  for (const [id, p] of promotions) {
    if (!p.endIsPresumed || p.validFrom >= today || p.validTo < today || promotedToday.has(p.retailerProductId)) continue;
    if (regularToday.get(p.retailerProductId) === p.promoPriceCents) promotions.set(id, { ...p, validTo: addDays(today, -1) });
  }
  const used = new Set([...prices.values()].map((p) => p.retailerProductId));
  for (const p of promotions.values()) used.add(p.retailerProductId);
  const products = new Map(previous.retailerProducts.filter((p) => used.has(p.id)).map((p) => [p.id, p]));
  for (const p of next.retailerProducts) products.set(p.id, p);
  return { retailerProducts: [...products.values()], prices: [...prices.values()], promotions: [...promotions.values()] };
}

export async function writeLiveSnapshot(dataDir: string, snap: LiveSnapshot): Promise<string> {
  const dir = liveSnapshotDir(dataDir);
  await mkdir(dir, { recursive: true });
  const path = join(dir, `${snap.connectorId}.json`);
  const tmp = `${path}.tmp`;
  await writeFile(tmp, `${JSON.stringify(snap)}\n`);
  await rename(tmp, path);
  return path;
}

export function reviewedMatchesPath(dataDir: string): string {
  return join(dataDir, 'matching', 'reviewed.json');
}

export async function readReviewedMatches(dataDir: string): Promise<ReviewedMatch[]> {
  const path = reviewedMatchesPath(dataDir);
  if (!existsSync(path)) return [];
  return (JSON.parse(await readFile(path, 'utf8')) as ReviewedMatchesFile).matches;
}

/**
 * Jeu de données réel complet (instantanés + correspondances validées), pour le moteur de
 * données : couverture, qualité, observations enrichies. Les sources de comparaison
 * (`benchmarkOnly`) sont incluses uniquement sur demande.
 */
export async function readLiveDataSet(
  dataDir: string,
  catalog: CanonicalProduct[],
  opts: { includeBenchmark?: boolean } = {},
): Promise<{ data: DataSet; health: ConnectorHealth[]; snapshots: LiveSnapshot[] }> {
  const snapshots = (await readLiveSnapshots(dataDir)).filter(
    (s) => opts.includeBenchmark || !sourceInfo({ connectorId: s.connectorId, kind: 'retailer_site' }).benchmarkOnly,
  );
  const reviewed = await readReviewedMatches(dataDir);
  const products = snapshots.flatMap((s) => s.batch.retailerProducts);
  const { matches } = matchesFor(products, catalog, reviewed);
  return {
    data: {
      products,
      matches: matches.filter((m) => m.status === 'validated'),
      prices: snapshots.flatMap((s) => s.batch.prices),
      promotions: snapshots.flatMap((s) => s.batch.promotions),
    },
    health: snapshots.map((s) => ({ connectorId: s.connectorId, status: s.status, collectedAt: s.collectedAt, message: s.message })),
    snapshots,
  };
}
