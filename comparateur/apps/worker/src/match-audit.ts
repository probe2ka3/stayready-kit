import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { isPublishableSource, meetsRequirements, normalizedUnitCents, normalizeText, significantTokens } from '@cabas/core';
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
  const chains = ['lidl', 'aldi', 'denner'];
  const products = snapshots.flatMap((s) => s.batch.retailerProducts).filter((p) => chains.includes(p.chainId));
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

  const rows: Array<{ line: string; publishable: boolean }> = [];
  for (const c of PRODUCTS) {
    const words = significantTokens(c.name).filter((w) => w.length > 3);
    if (!words.length) continue;
    for (const chain of chains) {
      const matched = (byCanonical.get(c.id) ?? []).filter((id) => byId.get(id)?.chainId === chain);
      const best = Math.min(...matched.map((id) => unit(id) ?? Infinity));
      for (const p of products) {
        if (p.chainId !== chain || decided.has(p.id) || matched.includes(p.id)) continue;
        if (!words.every((w) => normalizeText(p.name).includes(w)) || !meetsRequirements(c, p)) continue;
        const u = unit(p.id);
        if (!u || (matched.length > 0 && u >= best * ratio)) continue;
        rows.push({
          line: `| ${c.id} | ${chain} | ${matched.length ? (best / 100).toFixed(2) : 'non couverte'} | ${p.id} | ${p.name} | ${p.quantity.amount} ${p.quantity.unit} | ${((latest.get(p.id)?.cents ?? 0) / 100).toFixed(2)} | ${(u / 100).toFixed(2)} |`,
          publishable: isPublishableSource(p.connectorId),
        });
      }
    }
  }
  // Version versionnée : sources publiables seulement ; version complète (Aldi, Denner) hors dépôt.
  const render = (list: typeof rows) =>
    [
      '# Contrôle des correspondances manquantes',
      '',
      `Généré le ${ctx.now.toISOString().slice(0, 10)} (\`pnpm job match-audit\`) : ${list.length} candidats à revoir (beaucoup de faux positifs attendus : « pain d'épices au chocolat » n'est pas du chocolat).`,
      '',
      '| Référence | Enseigne | Meilleur prix rapproché (CHF/kg, l ou pièce) | Article | Désignation | Contenance | Prix | Prix normalisé |',
      '|---|---|---|---|---|---|---|---|',
      ...list.map((r) => r.line),
    ].join('\n');
  const outDir = join(ctx.env.dataDir, 'matching');
  const privateDir = join(ctx.env.dataDir, 'private', 'matching');
  await mkdir(outDir, { recursive: true });
  await mkdir(privateDir, { recursive: true });
  await writeFile(join(outDir, 'audit.md'), `${render(rows.filter((r) => r.publishable))}\n`);
  await writeFile(join(privateDir, 'audit.md'), `${render(rows)}\n`);
  ctx.log.info('Contrôle des correspondances', { candidats: rows.length, publiables: rows.filter((r) => r.publishable).length, fichiers: ['data/matching/audit.md', 'data/private/matching/audit.md'] });
}
