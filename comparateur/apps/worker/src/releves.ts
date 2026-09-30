import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { withCrowDistance } from '@cabas/core';
import { buildRelevesBatch, RELEVES_CONNECTOR_ID, writeLiveSnapshot } from '@cabas/connectors';
import { CHAINS } from '@cabas/reference';
import { snapshotPath } from './context';
import type { JobContext } from './jobs';
import { readLocalitiesSnapshot, readStoresSnapshot } from './snapshots';

/**
 * Relevés en magasin (`releves [--dir=data/releves] [--dry-run]`) : lit tous les fichiers CSV du
 * dossier, écarte les lignes invalides (listées avec leur motif) et écrit l'instantané
 * `data/prices/live/releves.json`, lu par le comparateur sans base de données. Les fichiers restent
 * la référence : l'instantané est entièrement recalculé à chaque import.
 */
export async function jobReleves(ctx: JobContext) {
  const dir = typeof ctx.flags.dir === 'string' ? ctx.flags.dir : join(ctx.env.dataDir, 'releves');
  if (!existsSync(dir)) throw new Error(`Dossier introuvable : ${dir}`);
  const names = (await readdir(dir)).filter((f) => f.toLowerCase().endsWith('.csv')).sort();
  const files = await Promise.all(names.map(async (name) => ({ name, content: await readFile(join(dir, name), 'utf8') })));
  const { stores } = await readStoresSnapshot(snapshotPath(ctx.env, 'stores'));
  const batch = buildRelevesBatch(files, { now: ctx.now, stores });
  const r = batch.report;
  if (r.rejected.length && !ctx.flags.quiet) {
    console.table(r.rejected.map((i) => ({ fichier: i.file ?? '', ligne: i.line ?? '', colonne: i.field ?? '', motif: i.message })));
  }
  ctx.log.info('Relevés lus', { fichiers: names.length, ...r.accepted, rejected: r.rejected.length, ...r.metrics });
  if (ctx.flags['dry-run']) return;
  if (batch.prices.length === 0 && batch.promotions.length === 0) {
    ctx.log.warn('Aucun relevé valide : instantané inchangé');
    return;
  }
  const path = await writeLiveSnapshot(ctx.env.dataDir, {
    connectorId: RELEVES_CONNECTOR_ID,
    label: 'Relevés en magasin',
    license: null,
    attribution: null,
    collectedAt: ctx.now.toISOString(),
    status: r.rejected.length ? 'partial' : 'success',
    message: r.rejected.length ? `${r.rejected.length} ligne(s) écartée(s)` : null,
    metrics: { ...r.metrics, files: names.map((n) => basename(n)).join(', ') },
    batch: { retailerProducts: batch.retailerProducts, prices: batch.prices, promotions: batch.promotions },
  });
  ctx.log.info('Instantané des relevés écrit', { path });
}

/**
 * Magasins proches d'un NPA (`magasins --npa=1630 [--rayon=5] [--enseignes=migros,coop]`) :
 * identifiants à reporter dans la colonne « magasin » des relevés.
 */
export async function jobMagasins(ctx: JobContext) {
  const zip = String(ctx.flags.npa ?? '');
  if (!/^\d{4}$/.test(zip)) throw new Error('Usage : magasins --npa=1630 [--rayon=5] [--enseignes=migros,coop]');
  const radius = Number(ctx.flags.rayon ?? 5);
  const chains = typeof ctx.flags.enseignes === 'string' ? ctx.flags.enseignes.split(',') : ['migros', 'coop', 'denner', 'aldi', 'lidl'];
  const { list } = await readLocalitiesSnapshot(snapshotPath(ctx.env, 'localities'));
  const place = list.find((l) => l.zip === zip);
  if (!place) throw new Error(`NPA inconnu : ${zip}`);
  const { stores } = await readStoresSnapshot(snapshotPath(ctx.env, 'stores'));
  const near = withCrowDistance(place, stores.filter((s) => chains.includes(s.chainId)))
    .filter((s) => s.crowKm <= radius)
    .sort((a, b) => a.crowKm - b.crowKm);
  const chainName = new Map(CHAINS.map((c) => [c.id, c.name]));
  console.log(`Magasins à moins de ${radius} km de ${zip} ${place.name} (distance à vol d'oiseau) :`);
  console.table(near.map((s) => ({ magasin: s.id, enseigne: chainName.get(s.chainId) ?? s.chainId, nom: s.name, adresse: [s.street, s.zip, s.city].filter(Boolean).join(' '), km: s.crowKm.toFixed(1), plan: osmUrl(s.id) })));
}

/** Lien OpenStreetMap d'une succursale (`osm:node/123` → page du nœud), pour la reconnaître sur le plan. */
function osmUrl(id: string): string {
  return id.startsWith('osm:') ? `https://www.openstreetmap.org/${id.slice(4)}` : '';
}
