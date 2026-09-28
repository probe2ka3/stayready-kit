import { mkdir, readFile, rename } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import {
  ChainConnector,
  ConnectorNotReadyError,
  downloadSwisstopoLocalities,
  LIVE_CONNECTOR_IDS,
  makeLocalityResolver,
  mergeBatches,
  OsmStoreConnector,
  parseImportFile,
  priceConnectors,
  type ConnectorBatch,
  type Logger,
  type PriceConnector,
} from '@cabas/connectors';
import {
  applyBatch,
  audit,
  chainDataStatus,
  finishRun,
  purgeDemoData,
  replaceLocalities,
  runMigrations,
  runQualityChecks,
  startRun,
  syncReference,
  upsertStores,
  type DbHandle,
} from '@cabas/db';
import { CATEGORIES, CHAINS, PRICE_ZONES, PRODUCTS } from '@cabas/reference';
import { jobCollect, jobExportOdbl, jobImportLive, jobReprocessLidl, jobRezone } from './collect';
import { jobMatchCandidates } from './match-review';
import { createLogger, requireDb, snapshotPath, type WorkerEnv } from './context';
import { readLocalitiesSnapshot, readStoresSnapshot, writeLocalitiesSnapshot, writeStoresSnapshot } from './snapshots';

export interface JobContext {
  env: WorkerEnv;
  now: Date;
  flags: Record<string, string | boolean>;
  args: string[];
  log: Logger;
}

async function withDb<T>(ctx: JobContext, fn: (db: DbHandle) => Promise<T>): Promise<T> {
  const db = requireDb(ctx.env);
  try {
    return await fn(db);
  } finally {
    await db.close();
  }
}

export async function jobMigrate(ctx: JobContext) {
  if (!ctx.env.databaseUrl) throw new Error('DATABASE_URL est requis');
  await runMigrations(ctx.env.databaseUrl);
  ctx.log.info('Migrations appliquées');
}

export async function jobReference(ctx: JobContext) {
  await withDb(ctx, async (db) => {
    await syncReference(db.db, { chains: CHAINS, zones: PRICE_ZONES, categories: CATEGORIES, products: PRODUCTS });
    ctx.log.info('Référentiel synchronisé', { chains: CHAINS.length, products: PRODUCTS.length });
  });
}

/** Localités swisstopo : `--download` rafraîchit l'instantané versionné. */
export async function jobLocalities(ctx: JobContext) {
  const path = snapshotPath(ctx.env, 'localities');
  if (ctx.flags.download) {
    const list = await downloadSwisstopoLocalities();
    await writeLocalitiesSnapshot(path, list, ctx.now);
    ctx.log.info('Instantané des localités mis à jour', { count: list.length, path });
  }
  if (!ctx.env.databaseUrl) return;
  const { list, retrievedAt } = await readLocalitiesSnapshot(path);
  await withDb(ctx, async (db) => {
    const runId = await startRun(db, 'swisstopo', 'localities');
    const n = await replaceLocalities(db, list);
    await finishRun(db, runId, 'success', { localities: n, retrievedAt });
    ctx.log.info('Localités chargées', { count: n });
  });
}

/** Succursales OpenStreetMap : `--download` interroge Overpass et rafraîchit l'instantané. */
export async function jobStores(ctx: JobContext) {
  const path = snapshotPath(ctx.env, 'stores');
  if (ctx.flags.download) {
    const { list } = await readLocalitiesSnapshot(snapshotPath(ctx.env, 'localities'));
    const connector = new OsmStoreConnector(makeLocalityResolver(list), ctx.env.overpassUrl);
    const { stores, report } = await connector.fetchStores({ now: ctx.now, log: ctx.log, env: ctx.env.env });
    if (stores.length < 500) throw new Error(`Seulement ${stores.length} succursales reçues : instantané non remplacé`);
    await writeStoresSnapshot(path, stores, ctx.now);
    const byChain: Record<string, number> = {};
    for (const s of stores) byChain[s.chainId] = (byChain[s.chainId] ?? 0) + 1;
    ctx.log.info('Instantané des succursales mis à jour', { count: stores.length, excluded: report.warnings.length, byChain });
  }
  if (!ctx.env.databaseUrl) return;
  const { stores, retrievedAt } = await readStoresSnapshot(path);
  await withDb(ctx, async (db) => {
    const runId = await startRun(db, 'osm', 'stores');
    const res = await upsertStores(db, 'osm', stores);
    await finishRun(db, runId, 'success', { ...res, retrievedAt });
    ctx.log.info('Succursales chargées', res);
  });
}

async function archive(files: string[], now: Date) {
  for (const f of files) {
    const dir = join(dirname(f), 'processed');
    await mkdir(dir, { recursive: true });
    await rename(f, join(dir, `${now.toISOString().replace(/[:.]/g, '-')}-${basename(f)}`));
  }
}

async function runConnector(ctx: JobContext, db: DbHandle, connector: PriceConnector) {
  const status = await connector.status({ importDir: ctx.env.importDir, env: ctx.env.env });
  if (status.state !== 'ready') {
    ctx.log.info('Connecteur ignoré', { connector: connector.id, state: status.state });
    return;
  }
  const runId = await startRun(db, connector.id, 'prices', String(ctx.flags.by ?? 'scheduler'));
  try {
    const pending = connector instanceof ChainConnector ? await connector.pendingFiles(ctx.env.importDir) : [];
    const batch = await connector.run({ now: ctx.now, log: ctx.log, importDir: ctx.env.importDir, env: ctx.env.env });
    const res = await applyBatch(db, batch, runId);
    const issues = [...batch.report.rejected, ...res.rejected];
    const status = issues.length === 0 ? 'success' : res.prices + res.promotions > 0 ? 'partial' : 'failed';
    await finishRun(db, runId, status, { ...res, rejected: issues.length, warnings: batch.report.warnings.length }, [
      ...issues,
      ...batch.report.warnings,
    ]);
    if (pending.length) await archive(pending, ctx.now);
    ctx.log.info('Connecteur exécuté', { connector: connector.id, status, products: res.products, prices: res.prices, promotions: res.promotions, rejected: issues.length });
  } catch (e) {
    const message = e instanceof ConnectorNotReadyError ? e.status.message : e instanceof Error ? e.message : String(e);
    await finishRun(db, runId, 'failed', {}, [], message);
    ctx.log.error('Échec du connecteur', { connector: connector.id, message });
  }
}

/** Exécute les connecteurs prêts (`--only a,b` pour restreindre, `--no-demo` pour exclure la démo). */
export async function jobConnectors(ctx: JobContext) {
  const only = typeof ctx.flags.only === 'string' ? new Set(ctx.flags.only.split(',')) : null;
  // Les collectes en ligne (Lidl, Open Prices) passent par la tâche `collect`.
  const connectors = priceConnectors().filter(
    (c) =>
      !LIVE_CONNECTOR_IDS.includes(c.id) &&
      (!only || only.has(c.id)) &&
      !(c.id === 'demo' && (ctx.flags['no-demo'] || process.env.DEMO_DATA === 'false')),
  );
  await withDb(ctx, async (db) => {
    for (const c of connectors) await runConnector(ctx, db, c);
  });
}

/** Import manuel de fichiers : `import <fichiers…> --connector <id> [--dry-run]`. */
export async function jobImport(ctx: JobContext) {
  const connectorId = String(ctx.flags.connector ?? '');
  if (!connectorId) throw new Error('--connector <id> est requis (ex. migros, coop…)');
  if (ctx.args.length === 0) throw new Error('Indiquer au moins un fichier CSV ou JSON');
  const chainId = CHAINS.some((c) => c.id === connectorId) ? connectorId : undefined;
  const batches: ConnectorBatch[] = [];
  for (const file of ctx.args) {
    const content = await readFile(file, 'utf8');
    batches.push(parseImportFile(content, basename(file), { connectorId, now: ctx.now, chainId }));
  }
  const batch = mergeBatches(connectorId, batches);
  const summary = {
    products: batch.retailerProducts.length,
    prices: batch.prices.length,
    promotions: batch.promotions.length,
    matchesValidated: batch.matches.filter((m) => m.status === 'validated').length,
    matchesSuggested: batch.matches.filter((m) => m.status === 'suggested').length,
    rejected: batch.report.rejected,
    warnings: batch.report.warnings,
  };
  if (ctx.flags['dry-run']) {
    console.log(JSON.stringify({ dryRun: true, ...summary }, null, 2));
    return;
  }
  await withDb(ctx, async (db) => {
    const runId = await startRun(db, connectorId, 'file', String(ctx.flags.by ?? 'cli'));
    const res = await applyBatch(db, batch, runId);
    const issues = [...batch.report.rejected, ...res.rejected];
    await finishRun(db, runId, issues.length ? 'partial' : 'success', { ...res }, [...issues, ...batch.report.warnings]);
    console.log(JSON.stringify({ ...summary, applied: res }, null, 2));
  });
}

export async function jobQuality(ctx: JobContext) {
  await withDb(ctx, async (db) => {
    const runId = await startRun(db, 'quality', 'quality');
    const report = await runQualityChecks(db, ctx.now, CHAINS);
    await finishRun(db, runId, 'success', { ...report });
    ctx.log.info('Contrôles qualité terminés', { ...report });
  });
}

export async function jobStatus(ctx: JobContext) {
  const connectors = priceConnectors();
  const statuses = await Promise.all(
    connectors.map(async (c) => ({ id: c.id, label: c.label, ...(await c.status({ importDir: ctx.env.importDir, env: ctx.env.env })) })),
  );
  console.table(statuses.map((s) => ({ connecteur: s.id, état: s.state, message: s.message.slice(0, 90) })));
  if (ctx.env.databaseUrl) {
    await withDb(ctx, async (db) => {
      console.table(await chainDataStatus(db, ctx.now));
    });
  }
}

/** Supprime les données de démonstration (avant l'ouverture avec des prix réels). */
export async function jobPurgeDemo(ctx: JobContext) {
  if (!ctx.flags.confirm) throw new Error('Ajouter --confirm pour supprimer les données de démonstration');
  await withDb(ctx, async (db) => {
    const n = await purgeDemoData(db);
    await audit(db, String(ctx.flags.by ?? 'cli'), 'demo.purge', null, null, { products: n });
    ctx.log.info('Données de démonstration supprimées', { products: n });
  });
}

/** Initialisation complète d'une base : migrations, référentiel, géodonnées, démo, qualité. */
export async function jobSeed(ctx: JobContext) {
  await jobMigrate(ctx);
  await jobReference(ctx);
  await jobLocalities({ ...ctx, flags: { ...ctx.flags, download: false } });
  await jobStores({ ...ctx, flags: { ...ctx.flags, download: false } });
  await jobConnectors(ctx);
  await jobQuality(ctx);
}

/** Tâche quotidienne : collecte des prix réels, connecteurs d'import, contrôles de qualité. */
export async function jobDaily(ctx: JobContext) {
  await jobCollect(ctx);
  if (ctx.env.databaseUrl) {
    await jobConnectors(ctx);
    await jobQuality(ctx);
  }
}

/** Tâche hebdomadaire : rafraîchissement des succursales OpenStreetMap. */
export async function jobWeekly(ctx: JobContext) {
  await jobStores({ ...ctx, flags: { ...ctx.flags, download: true } });
}

export const JOBS: Record<string, { run: (ctx: JobContext) => Promise<void>; help: string }> = {
  migrate: { run: jobMigrate, help: 'Applique les migrations SQL' },
  reference: { run: jobReference, help: 'Synchronise enseignes, zones, catégories et catalogue normalisé' },
  localities: { run: jobLocalities, help: 'Charge les localités swisstopo (--download pour rafraîchir)' },
  stores: { run: jobStores, help: 'Charge les succursales OSM (--download pour rafraîchir)' },
  connectors: { run: jobConnectors, help: 'Exécute les connecteurs prêts (--only a,b ; --no-demo)' },
  collect: { run: async (ctx) => void (await jobCollect(ctx)), help: 'Collecte les prix réels en ligne (--only lidl-web,open-prices ; --no-archive ; --no-snapshot)' },
  rezone: { run: jobRezone, help: 'Recalcule les zones tarifaires des succursales (instantané OSM)' },
  'import-live': { run: jobImportLive, help: 'Charge les instantanés de prix réels dans la base (amorçage)' },
  'reprocess-lidl': { run: jobReprocessLidl, help: 'Retraite la collecte Lidl depuis les pages archivées (--date AAAA-MM-JJ)' },
  'match-candidates': { run: jobMatchCandidates, help: 'Feuille de revue des correspondances (--out fichier ; --min-score 0.5)' },
  'export-odbl': { run: jobExportOdbl, help: 'Exporte les données dérivées d’Open Prices sous ODbL (--out <dossier>)' },
  import: { run: jobImport, help: 'Importe des fichiers : import <fichiers…> --connector <id> [--dry-run]' },
  quality: { run: jobQuality, help: 'Expire les promotions terminées et détecte les anomalies' },
  status: { run: jobStatus, help: 'État des connecteurs et des données par enseigne' },
  seed: { run: jobSeed, help: 'Initialise une base complète (migrations + données)' },
  daily: { run: jobDaily, help: 'Tâche quotidienne (collecte réelle + connecteurs + qualité)' },
  weekly: { run: jobWeekly, help: 'Tâche hebdomadaire (succursales OSM)' },
  'purge-demo': { run: jobPurgeDemo, help: 'Supprime les données de démonstration (--confirm)' },
};

export function loggerFor(job: string): Logger {
  return createLogger(`job:${job}`);
}
