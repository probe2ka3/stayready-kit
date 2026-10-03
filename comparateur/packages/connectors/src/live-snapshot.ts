import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { addDays, ageInDays, isPublishableSource, recordProvenance, sourceInfo, zurichToday, type CanonicalProduct, type ConnectorHealth, type DataSet } from '@cabas/core';
import { matchesFor, type ReviewedMatch, type ReviewedMatchesFile } from './matching';
import type { OpLocationReview } from './open-prices';
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
  /** Renseigné à la lecture : instantané d'une source non publiable (`data/private/live/`). */
  private?: boolean;
  /** Renseigné à la lecture : enregistrements écartés faute de provenance établie (étiquette ou URL divergente). */
  provenanceRejected?: number;
}

/** Instantanés des sources publiables, versionnés (`data/prices/live/`). */
export function liveSnapshotDir(dataDir: string): string {
  return join(dataDir, 'prices', 'live');
}

/**
 * Instantanés des sources non publiables (conditions : usage privé, publication interdite) :
 * `data/private/live/`, exclu du dépôt, des exports, des artefacts et des pages publiques.
 */
export function privateSnapshotDir(dataDir: string): string {
  return join(dataDir, 'private', 'live');
}

/** Dossier d'un instantané selon le droit de publication de la source. */
export function snapshotDirFor(dataDir: string, connectorId: string): string {
  return isPublishableSource(connectorId) ? liveSnapshotDir(dataDir) : privateSnapshotDir(dataDir);
}

/**
 * Lit les instantanés. La provenance ne repose pas sur la seule étiquette `connectorId` :
 * - le fichier doit porter le nom de sa source, et un fichier du dossier privé n'est jamais lu comme
 *   publiable (sinon il est ignoré) ;
 * - dans le fichier d'une source publiable, chaque article, prix et action doit en relever par ses
 *   étiquettes et par l'hôte de ses URL (`recordProvenance`) ; tout enregistrement divergent est écarté
 *   (compté dans `provenanceRejected`), ainsi que les prix et actions d'un article écarté ;
 * - dans le fichier d'une source non publiable, tous les enregistrements prennent l'étiquette de cette
 *   source : les filtres de publication les excluent quelle que soit l'étiquette d'origine.
 */
export async function readLiveSnapshots(dataDir: string, opts: { publicOnly?: boolean } = {}): Promise<LiveSnapshot[]> {
  // Dossier privé d'abord : un ancien instantané resté dans le dossier public ne masque jamais le plus récent.
  const privateDir = privateSnapshotDir(dataDir);
  const dirs = opts.publicOnly ? [liveSnapshotDir(dataDir)] : [privateDir, liveSnapshotDir(dataDir)];
  const out: LiveSnapshot[] = [];
  const seen = new Set<string>();
  for (const dir of dirs) {
    if (!existsSync(dir)) continue;
    for (const f of (await readdir(dir)).filter((x) => x.endsWith('.json')).sort()) {
      const snap = JSON.parse(await readFile(join(dir, f), 'utf8')) as LiveSnapshot;
      if (f !== `${snap.connectorId}.json`) continue;
      if (dir === privateDir && isPublishableSource(snap.connectorId)) continue;
      if (seen.has(snap.connectorId)) continue;
      seen.add(snap.connectorId);
      // « Privé » dépend du droit de publication de la source, pas du dossier où se trouve le fichier.
      snap.private = !isPublishableSource(snap.connectorId);
      if (opts.publicOnly && snap.private) continue;
      // Garde-fou : aucune donnée de démonstration dans un instantané réel.
      const batch = {
        retailerProducts: snap.batch.retailerProducts.filter((p) => !p.isDemo),
        prices: snap.batch.prices.filter((p) => !p.isDemo),
        promotions: snap.batch.promotions.filter((p) => !p.isDemo),
      };
      const source = snap.connectorId;
      if (snap.private) {
        snap.batch = {
          retailerProducts: batch.retailerProducts.map((p) => ({ ...p, connectorId: source })),
          prices: batch.prices.map((o) => ({ ...o, source: { ...o.source, connectorId: source } })),
          promotions: batch.promotions.map((p) => ({ ...p, source: { ...p.source, connectorId: source } })),
        };
        snap.provenanceRejected = 0;
      } else {
        const products = batch.retailerProducts.filter((p) => recordProvenance(source, [p.connectorId], [p.url]) === source);
        const keptIds = new Set(products.map((p) => p.id));
        const rejectedIds = new Set(batch.retailerProducts.filter((p) => !keptIds.has(p.id)).map((p) => p.id));
        const prices = batch.prices.filter(
          (o) => !rejectedIds.has(o.retailerProductId) && recordProvenance(source, [o.source.connectorId], [o.source.ref, o.sourceUrl]) === source,
        );
        const promotions = batch.promotions.filter(
          (p) => !rejectedIds.has(p.retailerProductId) && recordProvenance(source, [p.source.connectorId], [p.source.ref, p.sourceUrl]) === source,
        );
        snap.provenanceRejected =
          batch.retailerProducts.length - products.length + batch.prices.length - prices.length + batch.promotions.length - promotions.length;
        snap.batch = { retailerProducts: products, prices, promotions };
      }
      out.push(snap);
    }
  }
  return out.sort((a, b) => a.connectorId.localeCompare(b.connectorId));
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
  const dir = snapshotDirFor(dataDir, snap.connectorId);
  await mkdir(dir, { recursive: true });
  const path = join(dir, `${snap.connectorId}.json`);
  const tmp = `${path}.tmp`;
  const { private: _private, provenanceRejected: _rejected, ...data } = snap;
  await writeFile(tmp, `${JSON.stringify(data)}\n`);
  await rename(tmp, path);
  // Une source non publiable ne laisse jamais de copie dans le dossier versionné.
  if (dir !== liveSnapshotDir(dataDir)) await rm(join(liveSnapshotDir(dataDir), `${snap.connectorId}.json`), { force: true });
  return path;
}

/** Attributions revues de lieux Open Prices sans enseigne identifiable (voir `OpLocationReview`). */
export async function readOpLocationReviews(dataDir: string): Promise<OpLocationReview[]> {
  const path = join(dataDir, 'matching', 'op-locations.json');
  if (!existsSync(path)) return [];
  return (JSON.parse(await readFile(path, 'utf8')) as { locations: OpLocationReview[] }).locations;
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
