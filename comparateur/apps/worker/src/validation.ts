import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import {
  DEFAULT_FRESHNESS,
  meetsRequirements,
  normalizedUnitCents,
  sourceInfo,
  usablePrices,
  validateAgainstDataset,
  type ValidationDataset,
  type ValidationEntry,
} from '@cabas/core';
import { readLiveDataSet } from '@cabas/connectors';
import { ESSENTIAL_QUERIES, P1_ESSENTIALS, PRODUCTS } from '@cabas/reference';
import type { JobContext } from './jobs';

/** Enseignes suivies par le jeu de validation. */
export const VALIDATION_CHAINS = ['migros', 'coop', 'aldi', 'lidl', 'denner'];

export function validationPath(dataDir: string) {
  return join(dataDir, 'validation', 'essentials.json');
}

/**
 * Calibre le jeu de validation (`validation-calibrate`) à partir des correspondances revues et des
 * prix officiels du moment : articles attendus par enseigne, contenance admise (1/6 à 5 fois la
 * référence) et bande de prix normalisé plausible (÷ 3 à × 3 des prix observés). À relancer après
 * une revue des correspondances, jamais pour « faire passer » un contrôle en échec.
 */
export async function jobValidationCalibrate(ctx: JobContext) {
  const { data } = await readLiveDataSet(ctx.env.dataDir, PRODUCTS);
  const usable = usablePrices(data, ctx.now, DEFAULT_FRESHNESS);
  const products = new Map(data.products.map((p) => [p.id, p]));
  const entries: ValidationEntry[] = [];
  for (const slug of P1_ESSENTIALS) {
    const c = PRODUCTS.find((p) => p.slug === slug);
    if (!c) continue;
    const chains: ValidationEntry['chains'] = {};
    const units: number[] = [];
    for (const chainId of VALIDATION_CHAINS) {
      const ids: string[] = [];
      let community = false;
      for (const m of data.matches) {
        if (m.canonicalId !== c.id) continue;
        const p = products.get(m.retailerProductId);
        if (!p || p.chainId !== chainId || !meetsRequirements(c, p)) continue;
        const u = usable.get(p.id) ?? [];
        if (u.some((x) => sourceInfo({ connectorId: x.connectorId, kind: 'retailer_site' }).tier === 'first_party')) {
          ids.push(p.id);
          for (const x of u) {
            const n = normalizedUnitCents(x.cents, p.quantity);
            if (n) units.push(n);
          }
        } else if (u.length) community = true;
      }
      const hasFirstPartySource = data.products.some((p) => p.chainId === chainId && sourceInfo({ connectorId: p.connectorId, kind: 'retailer_site' }).tier === 'first_party');
      chains[chainId] = ids.length
        ? { status: 'covered', retailerProductIds: ids.sort() }
        : community
          ? { status: 'community_only' }
          : hasFirstPartySource
            ? { status: 'not_listed' }
            : { status: 'no_source' };
    }
    const fallback = c.quantity.unit === 'piece' ? { min: 5, max: 5_000 } : { min: 20, max: 20_000 };
    entries.push({
      slug,
      name: c.name,
      query: ESSENTIAL_QUERIES[slug],
      unit: c.quantity.unit,
      amount: { min: Math.floor(c.quantity.amount / 6), max: c.quantity.amount * 5 },
      unitCents: units.length ? { min: Math.floor(Math.min(...units) / 3), max: Math.ceil(Math.max(...units) * 3) } : fallback,
      chains,
    });
  }
  const dataset: ValidationDataset = {
    description:
      'Jeu de validation TesPrix : 50 besoins essentiels × 5 enseignes. Articles attendus (correspondances revues satisfaisant les exigences), contenance admise et bande de prix normalisé (centimes par kg, litre ou pièce). Sert à détecter les régressions de collecte.',
    version: '1',
    calibratedAt: ctx.now.toISOString(),
    chains: VALIDATION_CHAINS,
    entries,
  };
  const path = validationPath(ctx.env.dataDir);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(dataset, null, 1)}\n`);
  const covered = entries.flatMap((e) => Object.entries(e.chains).filter(([, v]) => v?.status === 'covered').map(([k]) => k));
  ctx.log.info('Jeu de validation calibré', { path, entries: entries.length, coveredPairs: covered.length });
}

/** Contrôle de non-régression (`validate`) : écarts entre la dernière collecte et le jeu de validation. */
export async function jobValidate(ctx: JobContext) {
  const dataset = JSON.parse(await readFile(validationPath(ctx.env.dataDir), 'utf8')) as ValidationDataset;
  const { data } = await readLiveDataSet(ctx.env.dataDir, PRODUCTS);
  const res = validateAgainstDataset(dataset, data, ctx.now, DEFAULT_FRESHNESS);
  if (!ctx.flags.quiet) {
    console.table(Object.entries(res.byChain).map(([chain, v]) => ({ enseigne: chain, attendus: v.expected, valides: v.ok })));
    if (res.failures.length) console.table(res.failures.map((f) => ({ type: f.kind, référence: f.slug, enseigne: f.chainId, article: f.retailerProductId ?? '', constat: f.message })));
  }
  ctx.log.info('Validation terminée', { checked: res.checked, passed: res.passed, failures: res.failures.length });
  if (ctx.flags.strict && res.failures.length) throw new Error(`${res.failures.length} écart(s) de validation`);
}
