import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { significantTokens, type CanonicalProduct, type RetailerProduct } from '@cabas/core';
import { readLiveSnapshots, readReviewedMatches } from '@cabas/connectors';
import { PRODUCTS } from '@cabas/reference';
import type { JobContext } from './jobs';

/**
 * Feuille de revue des correspondances (`match-candidates [--out fichier]`).
 * Pour chaque référence du catalogue, liste les articles réels candidats par enseigne,
 * avec un score volontairement large (désignations FR/DE). Les décisions sont ensuite
 * consignées à la main dans `data/matching/reviewed.json` : rien n'est validé automatiquement.
 */

/** Équivalences allemand → français des termes courants (désignations Lidl non traduites). */
const DE_FR: Record<string, string> = {
  milch: 'lait', vollmilch: 'lait entier', butter: 'beurre', eier: 'oeufs', mehl: 'farine', zucker: 'sucre',
  brot: 'pain', kase: 'fromage', kaese: 'fromage', apfel: 'pommes', aepfel: 'pommes', birnen: 'poires',
  teigwaren: 'pates', reis: 'riz', ol: 'huile', oel: 'huile', joghurt: 'yogourt', jogurt: 'yogourt', rahm: 'creme',
  schinken: 'jambon', kaffee: 'cafe', tee: 'the', schokolade: 'chocolat', saft: 'jus', wasser: 'eau',
  tomaten: 'tomates', karotten: 'carottes', ruebli: 'carottes', zwiebeln: 'oignons', kartoffeln: 'pommes de terre',
  bananen: 'bananes', zitronen: 'citrons', orangen: 'oranges', salat: 'salade', gurke: 'concombre',
  zucchetti: 'courgettes', peperoni: 'poivrons', hackfleisch: 'viande hachee', poulet: 'poulet', lachs: 'saumon',
  thon: 'thon', thunfisch: 'thon', essig: 'vinaigre', salz: 'sel', senf: 'moutarde', honig: 'miel',
  konfitüre: 'confiture', konfituere: 'confiture', mais: 'mais', erbsen: 'petits pois', bohnen: 'haricots',
  toilettenpapier: 'papier toilette', haushaltpapier: 'papier menage', waschmittel: 'lessive', spuelmittel: 'liquide vaisselle',
  zahnpasta: 'dentifrice', shampoo: 'shampooing', duschgel: 'gel douche', mineralwasser: 'eau minerale',
};

function tokens(text: string): string[] {
  const out: string[] = [];
  for (const t of significantTokens(text)) {
    const fr = DE_FR[t];
    out.push(...(fr ? significantTokens(fr) : [t]));
  }
  return out;
}

function tokenMatch(a: string, b: string): boolean {
  if (a === b) return true;
  const [s, l] = a.length <= b.length ? [a, b] : [b, a];
  return s.length >= 4 && l.startsWith(s);
}

export function candidateScore(c: CanonicalProduct, p: RetailerProduct): number {
  if (c.quantity.unit !== p.quantity.unit) return 0;
  const ratio = p.quantity.amount / c.quantity.amount;
  if (ratio < 0.2 || ratio > 5) return 0;
  const ct = tokens(`${c.name} ${(c.keywords ?? []).join(' ')}`);
  const pt = tokens(`${p.name} ${p.brand ?? ''}`);
  if (!ct.length || !pt.length) return 0;
  const hits = ct.filter((t) => pt.some((u) => tokenMatch(t, u))).length;
  if (hits === 0) return 0;
  const nameScore = hits / ct.length;
  const size = Math.max(0, 1 - Math.abs(Math.log(ratio)) / Math.log(5));
  return Math.round((0.75 * nameScore + 0.25 * size) * 100) / 100;
}

export async function jobMatchCandidates(ctx: JobContext) {
  const snaps = await readLiveSnapshots(ctx.env.dataDir);
  const products = snaps.flatMap((s) => s.batch.retailerProducts);
  const reviewed = new Set((await readReviewedMatches(ctx.env.dataDir)).map((r) => r.retailerProductId));
  const lastPrice = new Map<string, number>();
  for (const s of snaps) for (const o of s.batch.prices) lastPrice.set(o.retailerProductId, o.priceCents);
  for (const s of snaps) for (const p of s.batch.promotions) if (!lastPrice.has(p.retailerProductId) && p.promoPriceCents) lastPrice.set(p.retailerProductId, p.promoPriceCents);
  const minScore = Number(ctx.flags['min-score'] ?? 0.5);
  const out = PRODUCTS.map((c) => {
    const byChain: Record<string, Array<{ id: string; name: string; qty: string; price: number | null; score: number; reviewed: boolean; attrs: string }>> = {};
    for (const p of products) {
      const score = candidateScore(c, p);
      if (score < minScore) continue;
      (byChain[p.chainId] ??= []).push({
        id: p.id,
        name: `${p.brand ? `${p.brand} ` : ''}${p.name}`,
        qty: `${p.quantity.amount} ${p.quantity.unit}`,
        price: lastPrice.get(p.id) ?? null,
        score,
        reviewed: reviewed.has(p.id),
        attrs: [p.attributes.organic ? 'bio' : '', p.attributes.swissOrigin ? 'CH' : '', ...(p.attributes.labels ?? [])].filter(Boolean).join(','),
      });
    }
    for (const k of Object.keys(byChain)) byChain[k] = (byChain[k] ?? []).sort((a, b) => b.score - a.score).slice(0, 6);
    return {
      slug: c.slug,
      name: c.name,
      qty: `${c.quantity.amount} ${c.quantity.unit}`,
      requires: [c.attributes.organic ? 'bio' : '', c.attributes.swissOrigin ? 'CH' : '', ...(c.attributes.labels ?? []), c.brandRequired ?? ''].filter(Boolean).join(','),
      chains: byChain,
    };
  }).filter((c) => Object.keys(c.chains).length > 0);
  const path = typeof ctx.flags.out === 'string' ? ctx.flags.out : join(ctx.env.dataDir, 'matching', 'candidates.json');
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(out, null, 1)}\n`);
  ctx.log.info('Feuille de revue écrite', { path, canonical: out.length, products: products.length });
}
