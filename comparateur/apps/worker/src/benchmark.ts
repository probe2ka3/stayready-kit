import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  DEFAULT_FRESHNESS,
  meetsRequirements,
  normalizedUnitCents,
  sourceInfo,
  usablePrices,
  zurichToday,
  type ChainId,
} from '@cabas/core';
import {
  buildFoodAllyBatch,
  essentialQueries,
  FOODALLY_ATTRIBUTION,
  FOODALLY_VENDORS,
  PoliteFetcher,
  readLiveDataSet,
  runFoodAllyQueries,
  type FoodAllyQuery,
} from '@cabas/connectors';
import { PRODUCTS } from '@cabas/reference';
import { DEFAULT_USER_AGENT } from './collect';
import type { JobContext } from './jobs';

/** Quota anonyme publié par FoodAlly (requêtes par jour). */
const FOODALLY_DAILY_CAP = 100;

interface PairResult {
  slug: string;
  chainId: ChainId;
  foodally: { unitCents: number; priceCents: number; name: string; url: string; quantity: string } | null;
  ours: { unitCents: number; priceCents: number; name: string; connectorId: string } | null;
  /** (FoodAlly − TesPrix) / TesPrix, sur le prix normalisé. */
  gap: number | null;
}

/**
 * Comparaison avec FoodAlly (`benchmark-foodally [--from fichier]`) : une requête par besoin
 * essentiel (50 au plus, quota anonyme de 100 requêtes par jour respecté), puis, pour chaque
 * essentiel et chaque enseigne, meilleur prix plausible chez FoodAlly contre meilleur prix officiel
 * de TesPrix. Les résultats bruts restent hors dépôt (`data/benchmark/raw/`) ; seul le résumé
 * agrégé est versionné, avec attribution.
 */
export async function jobBenchmarkFoodAlly(ctx: JobContext) {
  const dir = join(ctx.env.dataDir, 'benchmark');
  const rawDir = join(dir, 'raw');
  await mkdir(rawDir, { recursive: true });
  /** --name=échantillon : fichiers distincts (`foodally-summary-<nom>.json`). */
  const suffix = typeof ctx.flags.name === 'string' ? `-${ctx.flags.name.replace(/[^a-z0-9-]/gi, '')}` : '';
  let queries: FoodAllyQuery[];
  let meta: Record<string, unknown> = {};
  if (typeof ctx.flags.from === 'string') {
    const raw = JSON.parse(await readFile(ctx.flags.from, 'utf8')) as { queries: Array<FoodAllyQuery & { fetchedAt: string }> };
    queries = raw.queries.map((q) => ({ ...q, fetchedAt: new Date(q.fetchedAt) }));
  } else {
    const fetcher = new PoliteFetcher({
      userAgent: ctx.env.env.HTTP_USER_AGENT || DEFAULT_USER_AGENT,
      minDelayMs: Math.max(3000, Number(ctx.env.env.CRAWL_MIN_DELAY_MS ?? 3000)),
      archiveDir: null,
      log: ctx.log,
    });
    // --queries=fichier : autre liste de besoins (ex. échantillon hors essentiels), même quota.
    const items =
      typeof ctx.flags.queries === 'string'
        ? (JSON.parse(await readFile(ctx.flags.queries, 'utf8')) as { queries: Array<{ slug: string; query: string }> }).queries
        : essentialQueries();
    // Plafond local de 100 requêtes par jour (quota anonyme publié), quelles que soient les valeurs
    // renvoyées par les en-têtes : le compteur du fournisseur peut dépendre de l'adresse de sortie.
    const today = zurichToday(ctx.now);
    let usedToday = 0;
    for (const f of await readdir(rawDir)) {
      if (!f.startsWith(`foodally-${today}`) || !f.endsWith('.json')) continue;
      usedToday += ((JSON.parse(await readFile(join(rawDir, f), 'utf8')) as { queries?: unknown[] }).queries ?? []).length;
    }
    const localBudget = FOODALLY_DAILY_CAP - Number(ctx.env.env.FOODALLY_DAILY_RESERVE ?? 10) - usedToday;
    if (localBudget <= 0) throw new Error(`Plafond quotidien local atteint : ${usedToday} requêtes FoodAlly déjà faites le ${today}`);
    const run = await runFoodAllyQueries(fetcher, items, {
      maxQueries: Math.min(localBudget, Number(ctx.flags.max ?? ctx.env.env.FOODALLY_MAX_QUERIES ?? 50)),
      dailyReserve: Number(ctx.env.env.FOODALLY_DAILY_RESERVE ?? 10),
    });
    queries = run.queries;
    meta = { stoppedBy: run.stoppedBy, remainingDay: run.remainingDay, requests: fetcher.stats.requests };
    await writeFile(join(rawDir, `foodally-${zurichToday(ctx.now)}${suffix}.json`), `${JSON.stringify({ at: ctx.now.toISOString(), attribution: FOODALLY_ATTRIBUTION, queries })}\n`);
  }

  const fa = buildFoodAllyBatch(queries);
  const faProducts = new Map(fa.retailerProducts.map((p) => [p.id, p]));
  const faPrice = new Map(fa.prices.map((o) => [o.retailerProductId, o]));
  const { data } = await readLiveDataSet(ctx.env.dataDir, PRODUCTS);
  const usable = usablePrices(data, ctx.now, DEFAULT_FRESHNESS);
  const ourProducts = new Map(data.products.map((p) => [p.id, p]));

  const pairs: PairResult[] = [];
  for (const q of queries) {
    const c = PRODUCTS.find((p) => p.slug === q.slug);
    if (!c) continue;
    for (const chainId of FOODALLY_VENDORS) {
      let best: PairResult['foodally'] = null;
      for (const m of fa.matches) {
        if (m.canonicalId !== q.slug) continue;
        const p = faProducts.get(m.retailerProductId);
        const o = faPrice.get(m.retailerProductId);
        if (!p || !o || p.chainId !== chainId || !meetsRequirements(c, p)) continue;
        const unit = normalizedUnitCents(o.priceCents, p.quantity);
        if (unit && (!best || unit < best.unitCents)) {
          best = { unitCents: unit, priceCents: o.priceCents, name: p.name, url: p.url ?? '', quantity: `${p.quantity.amount} ${p.quantity.unit}` };
        }
      }
      let ours: PairResult['ours'] = null;
      for (const m of data.matches) {
        if (m.canonicalId !== c.id) continue;
        const p = ourProducts.get(m.retailerProductId);
        if (!p || p.chainId !== chainId || !meetsRequirements(c, p)) continue;
        for (const u of usable.get(p.id) ?? []) {
          if (sourceInfo({ connectorId: u.connectorId, kind: 'retailer_site' }).tier !== 'first_party') continue;
          const unit = normalizedUnitCents(u.cents, p.quantity);
          if (unit && (!ours || unit < ours.unitCents)) ours = { unitCents: unit, priceCents: u.cents, name: p.name, connectorId: u.connectorId };
        }
      }
      const gap = best && ours ? Math.round(((best.unitCents - ours.unitCents) / ours.unitCents) * 1000) / 1000 : null;
      pairs.push({ slug: q.slug, chainId, foodally: best, ours, gap });
    }
  }

  const byChain = FOODALLY_VENDORS.map((chainId) => {
    const list = pairs.filter((p) => p.chainId === chainId);
    const gaps = list.map((p) => p.gap).filter((g): g is number => g !== null).sort((a, b) => a - b);
    const med = gaps.length ? (gaps[Math.floor(gaps.length / 2)] as number) : null;
    return {
      chainId,
      essentials: list.length,
      foodallyCovered: list.filter((p) => p.foodally).length,
      tesprixCovered: list.filter((p) => p.ours).length,
      both: gaps.length,
      medianGap: med,
      within5pct: gaps.filter((g) => Math.abs(g) <= 0.05).length,
      beyond20pct: gaps.filter((g) => Math.abs(g) > 0.2).length,
    };
  });
  const summary = {
    at: ctx.now.toISOString(),
    attribution: FOODALLY_ATTRIBUTION,
    method:
      'Une requête search_products par essentiel (termes allemands), 5 enseignes. Meilleur prix normalisé plausible (même dimension, contenance 1/6 à 5 fois la référence, mots de la requête dans la désignation, exigences de la référence) contre meilleur prix officiel TesPrix des correspondances revues.',
    queries: queries.length,
    results: queries.reduce((a, q) => a + q.results.length, 0),
    ...meta,
    byChain,
    largestGaps: pairs
      .filter((p) => p.gap !== null && Math.abs(p.gap) > 0.2)
      .sort((a, b) => Math.abs(b.gap ?? 0) - Math.abs(a.gap ?? 0))
      .slice(0, 15)
      .map((p) => ({ slug: p.slug, chainId: p.chainId, gap: p.gap, foodally: p.foodally && { name: p.foodally.name, quantity: p.foodally.quantity, priceCents: p.foodally.priceCents, url: p.foodally.url }, tesprix: p.ours && { name: p.ours.name, priceCents: p.ours.priceCents } })),
  };
  await writeFile(join(dir, `foodally-summary${suffix}.json`), `${JSON.stringify(summary, null, 2)}\n`);
  if (!ctx.flags.quiet) console.table(byChain);
  ctx.log.info('Comparaison FoodAlly écrite', { queries: queries.length, ...meta });
}
