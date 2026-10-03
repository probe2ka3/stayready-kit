import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { join } from 'node:path';
import { checkCollection, zurichToday, type Anomaly, type CollectionStats } from '@cabas/core';
import {
  ALDI_API_ORIGIN,
  ALDI_CONNECTOR_ID,
  AldiApiConnector,
  buildAldiBatch,
  buildLidlBatch,
  FOODALLY_ATTRIBUTION,
  FOODALLY_CONNECTOR_ID,
  FOODALLY_LICENSE,
  HttpBlockedError,
  LIVE_CONNECTOR_IDS,
  makeLocalityResolver,
  matchesFor,
  mergeLiveBatch,
  OPEN_PRICES_ATTRIBUTION,
  OPEN_PRICES_LICENSE,
  PoliteFetcher,
  priceConnectors,
  purgeArchive,
  readLiveSnapshots,
  readOpLocationReviews,
  readReviewedMatches,
  writeLiveSnapshot,
  type AldiApiPage,
  type AldiPages,
  type ConnectorBatch,
  type LidlPages,
  type LiveSnapshot,
  type PriceConnector,
} from '@cabas/connectors';
import { applyBatch, audit, finishRun, lastRunStats, purgeSource, recordAnomalies, startRun, type DbHandle } from '@cabas/db';
import { PRODUCTS, zoneForStore } from '@cabas/reference';
import { requireDb, snapshotPath } from './context';
import type { JobContext } from './jobs';
import { readLocalitiesSnapshot, readStoresSnapshot, writeStoresSnapshot } from './snapshots';

/** Agent HTTP par défaut : identifiable, sans imiter un navigateur. */
export const DEFAULT_USER_AGENT = 'TesPrixBot/0.1 (comparateur de prix en préparation; collecte respectueuse de robots.txt)';

async function connectorDeps(ctx: JobContext) {
  // Instantanés absents (nouvelle installation, tests) : dépendances vides, sans échec.
  const { stores } = await readStoresSnapshot(snapshotPath(ctx.env, 'stores')).catch(() => ({ stores: [] }));
  const { list } = await readLocalitiesSnapshot(snapshotPath(ctx.env, 'localities')).catch(() => ({ list: [] }));
  const resolve = makeLocalityResolver(list);
  const resolveZone = (chainId: string, lat: number, lon: number, zip?: string | null) => {
    const loc = resolve(lat, lon, zip);
    return zoneForStore(chainId, loc?.canton ?? null, loc?.lang ?? null);
  };
  return { stores, resolveZone, opLocations: await readOpLocationReviews(ctx.env.dataDir) };
}

function statsOf(connectorId: string, batch: ConnectorBatch): CollectionStats {
  const m = batch.report.metrics ?? {};
  return {
    connectorId,
    products: batch.retailerProducts?.length ?? 0,
    prices: batch.prices?.length ?? 0,
    promotions: batch.promotions?.length ?? 0,
    pages: Number(m.pages ?? 0) + Number(m.assortmentPages ?? 0) + Number(m.productPages ?? 0) + Number(m.offerPages ?? 0) || undefined,
    pageFailures: Number(m.pageFailures ?? 0) || undefined,
  };
}

function snapshotMeta(c: PriceConnector) {
  if (c.id === 'open-prices') return { license: OPEN_PRICES_LICENSE, attribution: OPEN_PRICES_ATTRIBUTION };
  if (c.id === FOODALLY_CONNECTOR_ID) return { license: FOODALLY_LICENSE, attribution: FOODALLY_ATTRIBUTION };
  return { license: null, attribution: null };
}

/** Plafonds de requêtes par source pour la collecte ciblée (surchargeables : `<ID>_MAX_REQUESTS`). */
export const DEFAULT_CAPS: Record<string, number> = {
  'lidl-web': 160,
  'aldi-api': 60,
  'denner-web': 90,
  'coop-epaper': 40,
  'open-prices': 60,
  foodally: 100,
};

export interface CollectOptions {
  /** Collecte ciblée sur le noyau (besoins et fiches déjà reliées). */
  targets?: { needs?: string[]; productUrls?: string[] };
  /** Plafonds de requêtes par source (défaut : aucun, sauf variables `<ID>_MAX_REQUESTS`). */
  caps?: Record<string, number>;
}

export interface CollectSummary {
  connector: string;
  status: LiveSnapshot['status'] | 'disabled' | 'not_configured' | 'awaiting_authorization' | 'blocked';
  message?: string | null;
  products: number;
  prices: number;
  promotions: number;
  rejected: number;
  anomalies: string;
  requests: number;
  cacheHits: number;
  budgetExhausted: boolean;
  durationMs: number;
  /** Dernière collecte réussie de la source (inchangée en cas d'échec). */
  collectedAt: string | null;
}

function capFor(ctx: JobContext, id: string, opts: CollectOptions): number {
  const env = ctx.env.env[`${id.replace(/-/g, '_').toUpperCase()}_MAX_REQUESTS`];
  const n = Number(env ?? opts.caps?.[id]);
  return Number.isFinite(n) && n > 0 ? n : Number.POSITIVE_INFINITY;
}

/**
 * Collecte des prix réels (`collect [--only lidl-web,open-prices]`).
 * Chaque connecteur est isolé (son propre client HTTP, son plafond de requêtes) : l'échec, le blocage
 * ou le plafond de l'un n'empêche pas les autres. Avec une base : enregistrement idempotent + alertes.
 * Toujours : instantané dans `data/prices/live/` (sources publiables) ou `data/private/live/`.
 */
export async function jobCollect(ctx: JobContext, override?: PriceConnector[], opts: CollectOptions = {}): Promise<CollectSummary[]> {
  const only = typeof ctx.flags.only === 'string' ? new Set(ctx.flags.only.split(',')) : null;
  const deps = await connectorDeps(ctx);
  const order = only ? [...only] : [];
  const connectors = (override ?? priceConnectors(deps).filter((c) => LIVE_CONNECTOR_IDS.includes(c.id)))
    .filter((c) => !only || only.has(c.id))
    // Ordre demandé (`--only a,b`) respecté ; sinon ordre du registre.
    .sort((a, b) => (order.length ? order.indexOf(a.id) - order.indexOf(b.id) : 0));
  const archiveDir = ctx.env.env.RAW_ARCHIVE_DIR ?? join(ctx.env.dataDir, 'raw');
  const makeFetcher = (id: string) =>
    new PoliteFetcher({
      userAgent: ctx.env.env.HTTP_USER_AGENT || DEFAULT_USER_AGENT,
      minDelayMs: Number(ctx.env.env.CRAWL_MIN_DELAY_MS ?? 3000),
      archiveDir: ctx.flags['no-archive'] ? null : archiveDir,
      cacheDir: join(ctx.env.dataDir, 'private', 'cache', 'http'),
      maxRequests: capFor(ctx, id, opts),
      log: ctx.log,
    });
  const totals = { requests: 0, bytes: 0, retries: 0, cacheHits: 0, blocked: {} as Record<string, string> };
  const reviewedMatches = await readReviewedMatches(ctx.env.dataDir);
  const previous = new Map((await readLiveSnapshots(ctx.env.dataDir)).map((s) => [s.connectorId, s]));
  const db: DbHandle | null = ctx.env.databaseUrl ? requireDb(ctx.env) : null;
  const summary: CollectSummary[] = [];

  try {
    for (const connector of connectors) {
      const status = await connector.status({ env: ctx.env.env });
      if (status.state !== 'ready') {
        summary.push({ connector: connector.id, status: status.state, message: status.message, products: 0, prices: 0, promotions: 0, rejected: 0, anomalies: '-', requests: 0, cacheHits: 0, budgetExhausted: false, durationMs: 0, collectedAt: previous.get(connector.id)?.collectedAt ?? null });
        continue;
      }
      const started = Date.now();
      const fetcher = makeFetcher(connector.id);
      const runId = db ? await startRun(db, connector.id, 'collect', String(ctx.flags.by ?? 'scheduler')) : null;
      const anomalies: Anomaly[] = [];
      let batch: ConnectorBatch | null = null;
      let runStatus: LiveSnapshot['status'] = 'success';
      let message: string | null = null;
      try {
        batch = await connector.run({ now: ctx.now, log: ctx.log, env: ctx.env.env, fetcher, reviewedMatches, catalog: PRODUCTS, targets: opts.targets });
        // « partiel » : pages manquantes (échecs, plafond, hôte abandonné). Des articles écartés pour
        // incohérence de la source relèvent du contrôle de qualité (colonne « rejetés »), pas d'une panne.
        if (fetcher.stats.budgetExhausted || fetcher.stats.tripped.length > 0 || Number(batch.report.metrics?.pageFailures ?? 0) > 0) runStatus = 'partial';
        const missing = Number(batch.report.metrics?.pageFailures ?? 0);
        if (fetcher.stats.budgetExhausted) message = `Plafond de requêtes atteint (${fetcher.stats.requests})`;
        else if (fetcher.stats.tripped.length > 0) message = `Hôte abandonné après des erreurs consécutives : ${fetcher.stats.tripped.join(', ')}`;
        else if (missing > 0) {
          const sample = batch.report.metrics?.pageFailureSample;
          message = `${missing} page(s) non lue(s) après nouvelle tentative${typeof sample === 'string' ? ` (ex. ${sample})` : ''}`;
        }
      } catch (e) {
        message = e instanceof Error ? e.message : String(e);
        runStatus = e instanceof HttpBlockedError ? 'blocked' : 'failed';
        anomalies.push({
          kind: runStatus === 'blocked' ? 'connector_blocked' : 'connector_failed',
          severity: 'error',
          entityType: 'connector',
          entityId: connector.id,
          message:
            runStatus === 'blocked'
              ? `Accès refusé par la source (aucun contournement tenté) : ${message}`
              : `Échec de la collecte : ${message}`,
          details: { at: ctx.now.toISOString() },
        });
        ctx.log.error('Collecte en échec', { connector: connector.id, status: runStatus, message });
      }
      totals.requests += fetcher.stats.requests;
      totals.bytes += fetcher.stats.bytes;
      totals.retries += fetcher.stats.retries;
      totals.cacheHits += fetcher.stats.cacheHits;
      Object.assign(totals.blocked, fetcher.stats.blocked);

      const prevSnap = previous.get(connector.id) ?? null;
      if (batch) {
        const current = statsOf(connector.id, batch);
        let prevStats: CollectionStats | null = null;
        if (db) {
          const s = await lastRunStats(db, connector.id);
          if (s && typeof s.prices === 'number') {
            prevStats = { ...statsOf(connector.id, { report: { metrics: s } } as unknown as ConnectorBatch), products: Number(s.products ?? 0), prices: Number(s.prices), promotions: Number(s.promotions ?? 0) };
          }
        } else if (prevSnap && (prevSnap.metrics.mode ?? 'complet') === (batch.report.metrics?.mode ?? 'complet')) {
          // Volumes comparés seulement entre collectes du même mode (ciblée ou complète).
          prevStats = {
            ...statsOf(connector.id, { report: { metrics: prevSnap.metrics } } as unknown as ConnectorBatch),
            products: Number(prevSnap.metrics.products ?? 0),
            prices: Number(prevSnap.metrics.prices ?? 0),
            promotions: Number(prevSnap.metrics.promotions ?? 0),
          };
        }
        anomalies.push(...checkCollection(current, prevStats));
      }

      let applied: Record<string, unknown> = {};
      if (db && batch) {
        const res = await applyBatch(db, batch, runId);
        applied = { products: res.products, prices: res.prices, promotions: res.promotions, matches: res.matches, rejected: res.rejected.length };
        if (res.rejected.length) runStatus = 'partial';
      }
      if (db) {
        if (anomalies.length) await recordAnomalies(db, anomalies);
        const issues = batch ? [...batch.report.rejected, ...batch.report.warnings.slice(0, 200)] : [];
        await finishRun(
          db,
          runId as number,
          runStatus === 'blocked' ? 'failed' : runStatus,
          { ...(batch?.report.metrics ?? {}), ...applied, blocked: runStatus === 'blocked' },
          issues,
          message ?? undefined,
        );
      }

      // Instantané : en cas d'échec, l'instantané précédent est conservé tel quel (statut mis à jour).
      const meta = snapshotMeta(connector);
      // Lecture complète réussie : remplacement (aucun ancien relevé n'échappe aux règles actuelles).
      const replace = Boolean(batch && connector.completeRead && runStatus === 'success');
      const merged = batch
        ? replace
          ? { retailerProducts: batch.retailerProducts, prices: batch.prices, promotions: batch.promotions }
          : mergeLiveBatch(prevSnap?.batch ?? null, batch, ctx.now)
        : (prevSnap?.batch ?? { retailerProducts: [], prices: [], promotions: [] });
      const snap: LiveSnapshot = {
        connectorId: connector.id,
        label: connector.label,
        ...meta,
        collectedAt: batch ? ctx.now.toISOString() : (prevSnap?.collectedAt ?? ctx.now.toISOString()),
        status: runStatus,
        message,
        metrics: batch
          ? { ...(batch.report.metrics ?? {}), products: batch.retailerProducts.length, prices: batch.prices.length, promotions: batch.promotions.length, rejected: batch.report.rejected.length, warnings: batch.report.warnings.length, anomalies: anomalies.length }
          : { ...(prevSnap?.metrics ?? {}), lastFailureAt: ctx.now.toISOString() },
        batch: merged,
      };
      if (!ctx.flags['no-snapshot']) await writeLiveSnapshot(ctx.env.dataDir, snap);
      if (batch) await writeReport(ctx, connector.id, batch, anomalies);
      summary.push({
        connector: connector.id,
        status: runStatus,
        message,
        products: batch?.retailerProducts.length ?? 0,
        prices: batch?.prices.length ?? 0,
        promotions: batch?.promotions.length ?? 0,
        rejected: batch?.report.rejected.length ?? 0,
        anomalies: anomalies.map((a) => a.kind).join(',') || '-',
        requests: fetcher.stats.requests,
        cacheHits: fetcher.stats.cacheHits,
        budgetExhausted: fetcher.stats.budgetExhausted,
        durationMs: Date.now() - started,
        collectedAt: snap.collectedAt,
      });
    }
  } finally {
    if (db) await db.close();
  }
  const purged = await purgeArchive(archiveDir, Number(ctx.env.env.RAW_ARCHIVE_DAYS ?? 30), ctx.now);
  ctx.log.info('Collecte terminée', { ...totals, archivesPurged: purged });
  if (!ctx.flags.quiet) console.table(summary.map(({ message: _m, ...r }) => r));
  return summary;
}

/** Rapport lisible de la dernière collecte (avertissements et rejets), hors dépôt git. */
async function writeReport(ctx: JobContext, connectorId: string, batch: ConnectorBatch, anomalies: Anomaly[]) {
  const dir = join(ctx.env.dataDir, 'prices', 'reports');
  await mkdir(dir, { recursive: true });
  await writeFile(
    join(dir, `${connectorId}.json`),
    `${JSON.stringify({ at: ctx.now.toISOString(), metrics: batch.report.metrics, anomalies, rejected: batch.report.rejected, warnings: batch.report.warnings }, null, 2)}\n`,
  );
}

/** Recalcule les zones tarifaires des succursales (langue de la localité, régions Lidl). */
export async function jobRezone(ctx: JobContext) {
  const path = snapshotPath(ctx.env, 'stores');
  const { stores, retrievedAt } = await readStoresSnapshot(path);
  const { list } = await readLocalitiesSnapshot(snapshotPath(ctx.env, 'localities'));
  const resolve = makeLocalityResolver(list);
  let changed = 0;
  for (const s of stores) {
    const loc = resolve(s.lat, s.lon, s.zip);
    const zoneId = zoneForStore(s.chainId, s.canton ?? loc?.canton ?? null, loc?.lang ?? null);
    if ((s.zoneId ?? null) !== zoneId) {
      s.zoneId = zoneId;
      changed++;
    }
  }
  await writeStoresSnapshot(path, stores, new Date(retrievedAt));
  ctx.log.info('Zones recalculées', { stores: stores.length, changed });
}

/**
 * Export ODbL des données dérivées d'Open Prices (prix normalisés, portée appliquée,
 * correspondances avec le catalogue) : `export-odbl [--out <dossier>]`.
 * Répond à l'obligation de partage à l'identique (ODbL art. 4.4 et 4.6).
 */
export async function jobExportOdbl(ctx: JobContext) {
  const snap = (await readLiveSnapshots(ctx.env.dataDir)).find((s) => s.connectorId === 'open-prices');
  if (!snap) throw new Error('Aucun instantané Open Prices : lancer `collect --only open-prices`');
  const reviewed = await readReviewedMatches(ctx.env.dataDir);
  const { matches } = matchesFor(snap.batch.retailerProducts, PRODUCTS, reviewed);
  const validated = matches.filter((m) => m.status === 'validated');
  const outDir = typeof ctx.flags.out === 'string' ? ctx.flags.out : join(ctx.env.dataDir, 'exports');
  await mkdir(outDir, { recursive: true });
  const products = new Map(snap.batch.retailerProducts.map((p) => [p.id, p]));
  const header = 'open_prices_id;gtin;chain_id;product_name;quantity;unit;price_chf;date;zone_id;observed_at_place;proof;canonical_product';
  const rows = snap.batch.prices.map((o) => {
    const p = products.get(o.retailerProductId);
    const canonical = validated.filter((m) => m.retailerProductId === o.retailerProductId).map((m) => m.canonicalId).join('|');
    const cells = [
      o.source.ref?.replace('open-prices:', '') ?? '',
      p?.gtin ?? '',
      p?.chainId ?? '',
      p?.name ?? '',
      p?.quantity.amount ?? '',
      p?.quantity.unit ?? '',
      (o.priceCents / 100).toFixed(2),
      o.observedAt.slice(0, 10),
      o.zoneId ?? '',
      o.observedAtPlace ?? '',
      o.proof ?? '',
      canonical,
    ];
    return cells.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(';');
  });
  const notice = `# Données dérivées d'Open Prices (https://prices.openfoodfacts.org) — ${OPEN_PRICES_ATTRIBUTION}.
# Cette base dérivée est mise à disposition sous licence ODbL 1.0 : https://opendatacommons.org/licenses/odbl/1-0/
# Généré le ${ctx.now.toISOString()} à partir de la collecte du ${snap.collectedAt}.
`;
  await writeFile(join(outDir, 'open-prices-derived.csv'), `${notice}${header}\n${rows.join('\n')}\n`);
  await writeFile(join(outDir, 'LICENSE-open-prices-derived.txt'), `${notice}\nLicence complète : https://opendatacommons.org/licenses/odbl/1-0/\n`);
  ctx.log.info('Export ODbL écrit', { rows: rows.length, matches: validated.length, dir: outDir });
}

/**
 * Retraitement d'une collecte Lidl à partir des pages archivées, sans nouvelle requête
 * (`reprocess-lidl [--date AAAA-MM-JJ]`) : utile après une correction de l'analyseur.
 */
export async function jobReprocessLidl(ctx: JobContext) {
  const archiveDir = ctx.env.env.RAW_ARCHIVE_DIR ?? join(ctx.env.dataDir, 'raw');
  const date = typeof ctx.flags.date === 'string' ? ctx.flags.date : ctx.now.toISOString().slice(0, 10);
  const pages: LidlPages = { assortment: [], offers: [], products: [] };
  for (const host of ['sortiment.lidl.ch', 'www.lidl.ch']) {
    const dir = join(archiveDir, host, date);
    let index: string;
    try {
      index = await readFile(join(dir, 'index.jsonl'), 'utf8');
    } catch {
      continue;
    }
    const latest = new Map<string, { file: string; fetchedAt: string }>();
    for (const line of index.split('\n').filter(Boolean)) {
      const e = JSON.parse(line) as { url: string; file: string; fetchedAt: string };
      latest.set(e.url, e);
    }
    for (const [url, e] of latest) {
      const html = gunzipSync(await readFile(join(dir, e.file))).toString('utf8');
      const entry = { url, html, fetchedAt: new Date(e.fetchedAt) };
      if (host === 'sortiment.lidl.ch' && /\/catalog\/product\/view\//.test(url)) pages.products?.push(entry);
      else if (host === 'sortiment.lidl.ch' && !/\.(xml|txt)$/.test(url)) pages.assortment.push(entry);
      if (host === 'www.lidl.ch' && /\/a\d+$/.test(url)) pages.offers.push(entry);
    }
  }
  if (pages.assortment.length + pages.offers.length === 0) throw new Error(`Aucune page archivée pour le ${date}`);
  const fetchedAt = [...pages.assortment, ...pages.offers, ...(pages.products ?? [])].reduce((a, p) => (p.fetchedAt > a ? p.fetchedAt : a), new Date(0));
  const batch = buildLidlBatch(pages, { now: fetchedAt, catalog: PRODUCTS, reviewedMatches: await readReviewedMatches(ctx.env.dataDir) });
  const prev = (await readLiveSnapshots(ctx.env.dataDir)).find((s) => s.connectorId === 'lidl-web');
  // L'archive du jour remplace entièrement la collecte du même jour : un relevé ou une action de ce
  // jour que le retraitement ne produit plus (lecture corrigée) ne survit pas à la fusion.
  const day = zurichToday(fetchedAt);
  const prevBatch = prev
    ? {
        ...prev.batch,
        prices: prev.batch.prices.filter((p) => zurichToday(new Date(p.observedAt)) !== day),
        promotions: prev.batch.promotions.filter((p) => !p.id.endsWith(`:${day}`)),
      }
    : null;
  await writeLiveSnapshot(ctx.env.dataDir, {
    connectorId: 'lidl-web',
    label: 'Lidl — site officiel (assortiment et actions)',
    license: null,
    attribution: null,
    collectedAt: fetchedAt.toISOString(),
    status: batch.report.rejected.length ? 'partial' : 'success',
    message: `Retraité depuis l'archive du ${date}`,
    metrics: { ...(batch.report.metrics ?? {}), products: batch.retailerProducts.length, prices: batch.prices.length, promotions: batch.promotions.length, rejected: batch.report.rejected.length, warnings: batch.report.warnings.length },
    // L'archive du jour remplace la collecte du même jour ; les jours précédents sont conservés.
    batch: mergeLiveBatch(prevBatch, batch, fetchedAt),
  });
  await writeReport(ctx, 'lidl-web', batch, []);
  ctx.log.info('Lidl retraité depuis l’archive', batch.report.metrics ?? {});
}

/**
 * Retraitement d'une collecte Aldi à partir des réponses archivées, sans nouvelle requête
 * (`reprocess-aldi [--date AAAA-MM-JJ]`).
 */
export async function jobReprocessAldi(ctx: JobContext) {
  const archiveDir = ctx.env.env.RAW_ARCHIVE_DIR ?? join(ctx.env.dataDir, 'raw');
  const date = typeof ctx.flags.date === 'string' ? ctx.flags.date : ctx.now.toISOString().slice(0, 10);
  const dir = join(archiveDir, new URL(ALDI_API_ORIGIN).host, date);
  let index: string;
  try {
    index = await readFile(join(dir, 'index.jsonl'), 'utf8');
  } catch {
    throw new Error(`Aucune réponse Aldi archivée pour le ${date}`);
  }
  const latest = new Map<string, { file: string; fetchedAt: string }>();
  for (const line of index.split('\n').filter(Boolean)) {
    const e = JSON.parse(line) as { url: string; file: string; fetchedAt: string };
    if (e.url.includes('/product-search')) latest.set(e.url, e);
  }
  const input: AldiPages = { pages: [] };
  for (const [url, e] of latest) {
    const json = JSON.parse(gunzipSync(await readFile(join(dir, e.file))).toString('utf8')) as AldiApiPage;
    input.pages.push({ url, json, fetchedAt: new Date(e.fetchedAt) });
  }
  const fetchedAt = input.pages.reduce((a, p) => (p.fetchedAt > a ? p.fetchedAt : a), new Date(0));
  const batch = buildAldiBatch(input, { now: fetchedAt, catalog: PRODUCTS, reviewedMatches: await readReviewedMatches(ctx.env.dataDir) });
  const prev = (await readLiveSnapshots(ctx.env.dataDir)).find((s) => s.connectorId === ALDI_CONNECTOR_ID);
  await writeLiveSnapshot(ctx.env.dataDir, {
    connectorId: ALDI_CONNECTOR_ID,
    label: new AldiApiConnector().label,
    license: null,
    attribution: null,
    collectedAt: fetchedAt.toISOString(),
    status: batch.report.rejected.length ? 'partial' : 'success',
    message: `Retraité depuis l'archive du ${date}`,
    metrics: { ...(batch.report.metrics ?? {}), products: batch.retailerProducts.length, prices: batch.prices.length, promotions: batch.promotions.length, rejected: batch.report.rejected.length, warnings: batch.report.warnings.length },
    batch: mergeLiveBatch(prev?.batch ?? null, batch, fetchedAt),
  });
  await writeReport(ctx, ALDI_CONNECTOR_ID, batch, []);
  ctx.log.info('Aldi retraité depuis l’archive', batch.report.metrics ?? {});
}

/** Charge les instantanés réels (`data/prices/live/`) dans la base : amorçage d'un déploiement. */
export async function jobImportLive(ctx: JobContext) {
  const snaps = await readLiveSnapshots(ctx.env.dataDir);
  if (snaps.length === 0) throw new Error('Aucun instantané de prix réels');
  const reviewed = await readReviewedMatches(ctx.env.dataDir);
  const db = requireDb(ctx.env);
  try {
    for (const s of snaps) {
      const { matches } = matchesFor(s.batch.retailerProducts, PRODUCTS, reviewed);
      const runId = await startRun(db, s.connectorId, 'collect', 'import-live');
      const res = await applyBatch(db, { connectorId: s.connectorId, ...s.batch, matches }, runId);
      await finishRun(db, runId, res.rejected.length ? 'partial' : 'success', { products: res.products, prices: res.prices, promotions: res.promotions, matches: res.matches, rejected: res.rejected.length, snapshotAt: s.collectedAt });
      ctx.log.info('Instantané chargé', { connector: s.connectorId, ...res, rejected: res.rejected.length });
    }
  } finally {
    await db.close();
  }
}

/** Retire toutes les données d'une source : `purge-source --connector <id> --confirm`. */
export async function jobPurgeSource(ctx: JobContext) {
  const id = String(ctx.flags.connector ?? '');
  if (!id || !ctx.flags.confirm) throw new Error('Usage : purge-source --connector <id> --confirm');
  await rm(join(ctx.env.dataDir, 'prices', 'live', `${id}.json`), { force: true });
  if (ctx.env.databaseUrl) {
    const db = requireDb(ctx.env);
    try {
      const res = await purgeSource(db, id);
      await audit(db, String(ctx.flags.by ?? 'cli'), 'source.purge', 'connector', id, res);
      ctx.log.info('Source supprimée de la base', { connector: id, ...res });
    } finally {
      await db.close();
    }
  }
  ctx.log.info('Instantané supprimé', { connector: id });
}
