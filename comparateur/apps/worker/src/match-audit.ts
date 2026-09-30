import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { meetsRequirements, normalizedUnitCents, normalizeText, significantTokens } from '@cabas/core';
import { matchesFor, readLiveSnapshots, readReviewedMatches } from '@cabas/connectors';
import { PRODUCTS } from '@cabas/reference';
import type { JobContext } from './jobs';

/**
 * Contrôle des correspondances manquantes (`match-audit [--ratio 0.7]`) : pour chaque référence et
 * chaque enseigne officielle, articles **non revus** dont la désignation contient les mots de la
 * référence, qui respectent ses exigences et dont le prix normalisé est nettement inférieur au
 * meilleur article rapproché (ou qui couvriraient une référence non couverte). Une correspondance
 * manquante fausse la comparaison (ex. : seule une eau de marque rapprochée alors que la marque
 * propre existe). Rien n'est validé automatiquement : la liste sert à la revue manuelle.
 */
export async function jobMatchAudit(ctx: JobContext) {
  const ratio = typeof ctx.flags.ratio === 'string' ? Number(ctx.flags.ratio) : 0.7;
  const snapshots = await readLiveSnapshots(ctx.env.dataDir);
  const products = snapshots.flatMap((s) => s.batch.retailerProducts).filter((p) => p.chainId === 'lidl' || p.chainId === 'aldi');
  const latest = new Map<string, { cents: number; at: string }>();
  for (const s of snapshots) {
    for (const o of s.batch.prices) {
      const cur = latest.get(o.retailerProductId);
      if (!cur || o.observedAt > cur.at) latest.set(o.retailerProductId, { cents: o.priceCents, at: o.observedAt });
    }
  }
  const reviewed = await readReviewedMatches(ctx.env.dataDir);
  const decided = new Set(reviewed.map((r) => r.retailerProductId));
  const { matches } = matchesFor(products, PRODUCTS, reviewed);
  const byCanonical = new Map<string, string[]>();
  for (const m of matches) if (m.status === 'validated') byCanonical.set(m.canonicalId, [...(byCanonical.get(m.canonicalId) ?? []), m.retailerProductId]);
  const byId = new Map(products.map((p) => [p.id, p]));
  const unit = (id: string) => {
    const p = byId.get(id);
    const l = latest.get(id);
    return p && l ? normalizedUnitCents(l.cents, p.quantity) : null;
  };

  const rows: string[] = [];
  for (const c of PRODUCTS) {
    const words = significantTokens(c.name).filter((w) => w.length > 3);
    if (!words.length) continue;
    for (const chain of ['lidl', 'aldi']) {
      const matched = (byCanonical.get(c.id) ?? []).filter((id) => byId.get(id)?.chainId === chain);
      const best = Math.min(...matched.map((id) => unit(id) ?? Infinity));
      for (const p of products) {
        if (p.chainId !== chain || decided.has(p.id) || matched.includes(p.id)) continue;
        if (!words.every((w) => normalizeText(p.name).includes(w)) || !meetsRequirements(c, p)) continue;
        const u = unit(p.id);
        if (!u || (matched.length > 0 && u >= best * ratio)) continue;
        rows.push(
          `| ${c.id} | ${chain} | ${matched.length ? (best / 100).toFixed(2) : 'non couverte'} | ${p.id} | ${p.name} | ${p.quantity.amount} ${p.quantity.unit} | ${((latest.get(p.id)?.cents ?? 0) / 100).toFixed(2)} | ${(u / 100).toFixed(2)} |`,
        );
      }
    }
  }
  const outDir = join(ctx.env.dataDir, 'matching');
  await mkdir(outDir, { recursive: true });
  const md = [
    '# Contrôle des correspondances manquantes',
    '',
    `Généré le ${ctx.now.toISOString().slice(0, 10)} (\`pnpm job match-audit\`) : ${rows.length} candidats à revoir (beaucoup de faux positifs attendus : « pain d'épices au chocolat » n'est pas du chocolat).`,
    '',
    '| Référence | Enseigne | Meilleur prix rapproché (CHF/kg, l ou pièce) | Article | Désignation | Contenance | Prix | Prix normalisé |',
    '|---|---|---|---|---|---|---|---|',
    ...rows,
  ].join('\n');
  await writeFile(join(outDir, 'audit.md'), `${md}\n`);
  ctx.log.info('Contrôle des correspondances', { candidats: rows.length, fichier: 'data/matching/audit.md' });
}
