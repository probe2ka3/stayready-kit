import { existsSync } from 'node:fs';
import { mkdir, open, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  ageInDays,
  CHAIN_ACCESS,
  DEFAULT_FRESHNESS,
  isPublishableSource,
  meetsRequirements,
  validateAgainstDataset,
  zurichToday,
  type ValidationDataset,
} from '@cabas/core';
import { matchesFor, readLiveDataSet, readLiveSnapshots, readReviewedMatches } from '@cabas/connectors';
import { P1_ESSENTIALS, PRODUCTS } from '@cabas/reference';
import { DEFAULT_CAPS, jobCollect, type CollectSummary } from './collect';
import { jobDataReport } from './data-report';
import { jobDemoBaskets } from './demo-baskets';
import type { JobContext } from './jobs';
import { jobEssentialsMatrix } from './matrix';
import { jobReleves } from './releves';
import { validationPath } from './validation';

/** Sources de la collecte quotidienne, dans l'ordre d'exécution (les plus légères d'abord). */
export const DAILY_SOURCES = ['open-prices', 'coop-epaper', 'denner-web', 'aldi-api', 'lidl-web'];

export interface StepResult {
  step: string;
  ok: boolean;
  durationMs: number;
  message?: string;
}

export interface ChainFreshness {
  chainId: string;
  automatic: 'public' | 'private' | 'none';
  /** Besoins du noyau avec un prix utilisable (officiel ≤ 30 j, communautaire ≤ 90 j). */
  coreNeedsPriced: number;
  /** Besoins du noyau lus lors de cette collecte (prix du jour). */
  coreNeedsToday: number;
  newestObservation: string | null;
  promotionsActive: number;
  promotionsEndUnknown: number;
}

export interface DailyRun {
  date: string;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  mode: 'noyau';
  sources: CollectSummary[];
  steps: StepResult[];
  chains: ChainFreshness[];
  validation: { checked: number; passed: number; failures: number } | null;
  /** Requêtes HTTP de la journée (sources reprises dans la journée comprises). */
  requests: number;
  /** Au moins une source a produit un lot (succès ou partiel). */
  ok: boolean;
}

export function runsDir(dataDir: string) {
  return join(dataDir, 'private', 'runs');
}

export async function readLatestRun(dataDir: string): Promise<DailyRun | null> {
  const path = join(runsDir(dataDir), 'latest.json');
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(await readFile(path, 'utf8')) as DailyRun;
  } catch {
    return null;
  }
}

/** Verrou : une seule exécution à la fois (un verrou de plus de 3 h est considéré abandonné). */
async function acquireLock(dir: string, now: Date): Promise<(() => Promise<void>) | null> {
  await mkdir(dir, { recursive: true });
  const path = join(dir, 'quotidien.lock');
  try {
    const st = await stat(path);
    if (now.getTime() - st.mtimeMs < 3 * 3600_000) return null;
    await rm(path, { force: true });
  } catch {
    // absent
  }
  try {
    const fh = await open(path, 'wx');
    await fh.writeFile(`${process.pid} ${now.toISOString()}\n`);
    await fh.close();
  } catch {
    return null;
  }
  return () => rm(path, { force: true });
}

/**
 * Sources à relancer : toutes, sauf si l'exécution du jour a déjà eu lieu ; dans ce cas seulement
 * celles en échec technique (`failed`) — une source bloquée (403, anti-robot) n'est jamais relancée
 * le même jour, une source réussie non plus.
 */
export function sourcesToRun(previous: DailyRun | null, today: string, all: string[], force: boolean): string[] {
  if (force || !previous || previous.date !== today) return all;
  return previous.sources.filter((s) => s.status === 'failed' && all.includes(s.connector)).map((s) => s.connector);
}

async function step(ctx: JobContext, steps: StepResult[], name: string, fn: () => Promise<void>) {
  const t = Date.now();
  try {
    await fn();
    steps.push({ step: name, ok: true, durationMs: Date.now() - t });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    steps.push({ step: name, ok: false, durationMs: Date.now() - t, message });
    ctx.log.error(`Étape en échec : ${name}`, { message });
  }
}

/** Fraîcheur et couverture du noyau par enseigne, calculées sur les instantanés (publics et privés). */
export async function coreFreshness(dataDir: string, now: Date): Promise<ChainFreshness[]> {
  const { data } = await readLiveDataSet(dataDir, PRODUCTS);
  const core = new Map(PRODUCTS.filter((p) => (P1_ESSENTIALS as readonly string[]).includes(p.slug)).map((p) => [p.id, p]));
  const products = new Map(data.products.map((p) => [p.id, p]));
  const today = zurichToday(now);
  const out: ChainFreshness[] = [];
  for (const [chainId, access] of Object.entries(CHAIN_ACCESS)) {
    const priced = new Set<string>();
    const todayNeeds = new Set<string>();
    let newest: string | null = null;
    const ids = new Set<string>();
    for (const m of data.matches) {
      const c = core.get(m.canonicalId);
      const p = products.get(m.retailerProductId);
      if (!c || !p || p.chainId !== chainId || !meetsRequirements(c, p)) continue;
      ids.add(p.id);
      for (const o of data.prices) {
        if (o.retailerProductId !== p.id) continue;
        const age = ageInDays(o.observedAt, now);
        const limit = o.source.kind === 'open_data' || o.source.kind === 'manual_survey' ? DEFAULT_FRESHNESS.crowdStaleAfterDays : DEFAULT_FRESHNESS.staleAfterDays;
        if (age <= limit) priced.add(c.id);
        if (zurichToday(new Date(o.observedAt)) === today) todayNeeds.add(c.id);
        if (!newest || o.observedAt > newest) newest = o.observedAt;
      }
      for (const pr of data.promotions) {
        if (pr.retailerProductId === p.id && pr.type === 'price' && pr.validFrom <= today && pr.validTo >= today) priced.add(c.id);
      }
    }
    const promos = data.promotions.filter((p) => ids.has(p.retailerProductId) && p.validTo >= today);
    out.push({
      chainId,
      automatic: access.automatic,
      coreNeedsPriced: priced.size,
      coreNeedsToday: todayNeeds.size,
      newestObservation: newest,
      promotionsActive: promos.filter((p) => p.validFrom <= today).length,
      promotionsEndUnknown: promos.filter((p) => p.endIsPresumed).length,
    });
  }
  return out;
}

/**
 * Chaîne quotidienne complète (`quotidien [--force] [--sources=a,b] [--sans-exports]`) :
 * collecte ciblée → extraction → normalisation → rapprochement → contrôles → exports publiables.
 *
 * - Une exécution par jour (date de Zurich) : relancée le même jour, seules les sources en échec
 *   technique sont reprises (rattrapage automatique sans double collecte) ; `--force` relance tout.
 * - Chaque source est isolée et plafonnée (`DEFAULT_CAPS`, variables `<ID>_MAX_REQUESTS`).
 * - Une source en échec garde ses données précédentes avec leur date d'origine.
 * - Journal : `data/private/runs/<date>.json` et `latest.json` (lu par l'administration).
 * - Code de sortie non nul si aucune source n'a produit de données (le planificateur le signale).
 */
export async function jobQuotidien(jobCtx: JobContext) {
  let ctx = jobCtx;
  const dataDir = ctx.env.dataDir;
  const started = new Date();
  const today = zurichToday(ctx.now);
  const dir = runsDir(dataDir);
  const release = await acquireLock(dir, started);
  if (!release) {
    ctx.log.warn('Une collecte quotidienne est déjà en cours : rien à faire');
    return;
  }
  try {
    const previous = await readLatestRun(dataDir);
    const requested = typeof ctx.flags.sources === 'string' ? ctx.flags.sources.split(',').filter(Boolean) : DAILY_SOURCES;
    const toRun = sourcesToRun(previous, today, requested, Boolean(ctx.flags.force));
    if (toRun.length === 0) {
      ctx.log.info('Collecte du jour déjà faite, aucune source à reprendre', { date: today, previous: previous?.finishedAt });
      return;
    }
    const steps: StepResult[] = [];

    // Cibles : besoins du noyau et fiches déjà reliées à ces besoins (Lidl).
    const snapshots = await readLiveSnapshots(dataDir);
    const reviewed = await readReviewedMatches(dataDir);
    const core = new Set(PRODUCTS.filter((p) => (P1_ESSENTIALS as readonly string[]).includes(p.slug)).map((p) => p.id));
    const productUrls: string[] = [];
    for (const s of snapshots) {
      const { matches } = matchesFor(s.batch.retailerProducts, PRODUCTS, reviewed);
      const ids = new Set(matches.filter((m) => m.status === 'validated' && core.has(m.canonicalId)).map((m) => m.retailerProductId));
      for (const p of s.batch.retailerProducts) if (ids.has(p.id) && p.url) productUrls.push(p.url);
    }

    let sources: CollectSummary[] = [];
    await step(ctx, steps, 'collecte', async () => {
      sources = await jobCollect({ ...ctx, flags: { ...ctx.flags, only: toRun.join(','), quiet: true } }, undefined, {
        targets: { needs: [...P1_ESSENTIALS], productUrls },
        caps: DEFAULT_CAPS,
      });
    });
    // Reprise dans la journée : les sources non relancées gardent leur résultat du matin.
    if (previous?.date === today) {
      for (const s of previous.sources) if (!sources.some((x) => x.connector === s.connector)) sources.push(s);
    }

    // Étapes suivantes : « maintenant » = fin de la collecte (les prix lus pendant le cycle sont
    // postérieurs à son début et seraient sinon considérés comme datés du futur).
    ctx = { ...ctx, now: new Date() };
    const releves = join(dataDir, 'releves');
    if (existsSync(releves) && (await readdir(releves)).some((f) => f.endsWith('.csv') && f !== 'modele.csv')) {
      await step(ctx, steps, 'relevés en magasin', () => jobReleves({ ...ctx, flags: { quiet: true } }));
    }

    let validation: DailyRun['validation'] = null;
    await step(ctx, steps, 'contrôle de non-régression', async () => {
      const dataset = JSON.parse(await readFile(validationPath(dataDir), 'utf8')) as ValidationDataset;
      const { data } = await readLiveDataSet(dataDir, PRODUCTS);
      const res = validateAgainstDataset(dataset, data, ctx.now, DEFAULT_FRESHNESS);
      validation = { checked: res.checked, passed: res.passed, failures: res.failures.length };
    });
    await step(ctx, steps, 'rapport de qualité', () => jobDataReport({ ...ctx, flags: { quiet: true } }));
    let chains: ChainFreshness[] = [];
    await step(ctx, steps, 'fraîcheur du noyau', async () => {
      chains = await coreFreshness(dataDir, ctx.now);
    });
    if (!ctx.flags['sans-exports']) {
      await step(ctx, steps, 'matrice et page publique', () => jobEssentialsMatrix({ ...ctx, flags: { quiet: true } }));
      await step(ctx, steps, 'panier de base (vue publique)', () =>
        jobDemoBaskets({ ...ctx, flags: { quiet: true, baskets: 'panier-noyau.json', name: 'panier-noyau-public', public: true, aujourdhui: true } }),
      );
      await step(ctx, steps, 'panier de base (pilote privé)', () =>
        jobDemoBaskets({ ...ctx, flags: { quiet: true, baskets: 'panier-noyau.json', name: 'panier-noyau-prive', aujourdhui: true } }),
      );
    }

    const finished = new Date();
    const run: DailyRun = {
      date: today,
      startedAt: started.toISOString(),
      finishedAt: finished.toISOString(),
      durationMs: finished.getTime() - started.getTime(),
      mode: 'noyau',
      sources,
      steps,
      chains,
      validation,
      requests: sources.reduce((n, s) => n + (s.requests ?? 0), 0),
      ok: sources.some((s) => s.status === 'success' || s.status === 'partial'),
    };
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, `${today}.json`), `${JSON.stringify(run, null, 1)}\n`);
    await writeFile(join(dir, 'latest.json'), `${JSON.stringify(run, null, 1)}\n`);
    await pruneRuns(dir, 90);

    if (!ctx.flags.quiet) {
      console.table(sources.map((s) => ({ source: s.connector, publiable: isPublishableSource(s.connector) ? 'oui' : 'non', état: s.status, requêtes: s.requests, rejetés: s.rejected, cache: s.cacheHits, articles: s.products, prix: s.prices, actions: s.promotions, 'durée (s)': Math.round(s.durationMs / 1000), 'dernière réussite': s.collectedAt?.slice(0, 16) ?? '—' })));
      console.table(chains.map((c) => ({ enseigne: c.chainId, automatique: c.automatic, 'besoins avec prix': `${c.coreNeedsPriced}/50`, 'lus ce jour': c.coreNeedsToday, 'dernier relevé': c.newestObservation?.slice(0, 10) ?? '—', 'actions en cours': c.promotionsActive, 'fin inconnue': c.promotionsEndUnknown })));
      console.table(steps.map((s) => ({ étape: s.step, ok: s.ok ? 'oui' : 'NON', 'durée (s)': Math.round(s.durationMs / 1000), message: s.message ?? '' })));
    }
    ctx.log.info('Collecte quotidienne terminée', { date: today, ok: run.ok, requests: run.requests, durationMs: run.durationMs, stepsFailed: steps.filter((s) => !s.ok).length });
    if (!run.ok) throw new Error('Aucune source n’a produit de données : voir data/private/runs/latest.json');
  } finally {
    await release();
  }
}

async function pruneRuns(dir: string, keepDays: number) {
  const limit = zurichToday(new Date(Date.now() - keepDays * 86_400_000));
  for (const f of await readdir(dir)) {
    if (/^\d{4}-\d{2}-\d{2}\.json$/.test(f) && f.slice(0, 10) < limit) await rm(join(dir, f), { force: true });
  }
}
