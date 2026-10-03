import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { formatQuantity, packsNeeded, zurichToday, type Promotion, type RetailerProduct } from '@cabas/core';
import { evaluateOfferRules, isWeeklyOffer, readLiveSnapshots, readReviewedMatches, type OfferRule } from '@cabas/connectors';
import { PRODUCTS } from '@cabas/reference';
import type { JobContext } from './jobs';

const chf = (c: number | null | undefined) => (c == null ? '—' : (c / 100).toFixed(2));
const day = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}`;
const REGION: Record<string, string> = { 'lidl-romandie': 'Suisse romande', 'lidl-deutschschweiz': 'Suisse alémanique', 'lidl-ticino': 'Tessin' };

/**
 * `offres-lidl` : offres hebdomadaires Lidl en cours ou annoncées (instantané publiable
 * `data/prices/live/lidl-web.json`), reliées par une règle revue (`offerRules` de
 * data/matching/reviewed.json) ou laissées « à vérifier » avec le motif. Écrit docs/OFFRES_LIDL.md :
 * chaque offre reliée garde ses propres dates, prix, carte, région et source ; aucune n'est prolongée.
 */
export async function jobOffresLidl(ctx: JobContext) {
  const dataDir = ctx.env.dataDir;
  const today = zurichToday(ctx.now);
  const snap = (await readLiveSnapshots(dataDir, { publicOnly: true })).find((s) => s.connectorId === 'lidl-web');
  if (!snap) throw new Error('Instantané Lidl introuvable (data/prices/live/lidl-web.json)');
  const reviewed = await readReviewedMatches(dataDir);
  const rules = reviewed.flatMap((r) => (r.offerRule ? [r.offerRule] : []));
  // Décisions antérieures par identifiant d'offre (prioritaires sur les règles) : signalées comme telles.
  const byId = new Map(reviewed.filter((r) => !r.offerRule).map((r) => [r.retailerProductId, r]));
  const promosBy = new Map<string, Promotion[]>();
  for (const p of snap.batch.promotions) promosBy.set(p.retailerProductId, [...(promosBy.get(p.retailerProductId) ?? []), p]);
  const current = snap.batch.retailerProducts.filter((p) => isWeeklyOffer(p) && (promosBy.get(p.id) ?? []).some((x) => x.validTo >= today));
  const bySlug = new Map(PRODUCTS.map((c) => [c.slug, c]));

  const linked: string[] = [];
  const toReview: string[] = [];
  let unrelated = 0;
  let newlyLinked = 0;
  const promoText = (p: RetailerProduct) =>
    (promosBy.get(p.id) ?? [])
      .filter((x) => x.validTo >= today)
      .map((x) => `${x.loyaltyProgram ? 'Lidl Plus ' : ''}${chf(x.promoPriceCents)}${x.referencePriceCents ? ` (au lieu de ${chf(x.referencePriceCents)})` : ''} du ${day(x.validFrom)} au ${day(x.validTo)}${x.endIsPresumed ? ' (fin présumée)' : ''}${x.zoneId ? `, ${REGION[x.zoneId] ?? x.zoneId}` : ''}`)
      .filter((v, i, a) => a.indexOf(v) === i)
      .join(' ; ');
  for (const p of current.sort((a, b) => a.name.localeCompare(b.name, 'fr'))) {
    const out = evaluateOfferRules(p, rules, PRODUCTS);
    if (!out) {
      unrelated++;
      continue;
    }
    const link = p.url ? `[${p.sku.replace('offer-', '')}](${p.url})` : p.sku;
    if (out.status === 'linked') {
      const need = out.canonical;
      const packs = packsNeeded(1, need.quantity.amount, p.quantity.amount);
      const bought = { amount: packs * p.quantity.amount, unit: p.quantity.unit };
      const prior = byId.get(p.id);
      if (!prior) newlyLinked++;
      linked.push(
        `| ${link} | ${p.name} | ${formatQuantity(p.quantity)} | \`${need.slug}\` (${formatQuantity(need.quantity)}) | ${packs} × ${formatQuantity(p.quantity)} = ${formatQuantity(bought)} | ${promoText(p)} | \`${out.rule.id}\` | ${prior ? `décision par identifiant du ${day(prior.reviewedAt)}, confirmée` : '**nouvelle** (règle)'} |`,
      );
    } else {
      const need = out.rule ? bySlug.get(out.rule.canonicalSlug) : undefined;
      toReview.push(`| ${link} | ${p.name} | ${formatQuantity(p.quantity)} | ${need ? `\`${need.slug}\`` : '—'} | ${out.reason} | ${promoText(p)} |`);
    }
  }

  const lines = [
    '# Offres hebdomadaires Lidl reliées aux 50 besoins',
    '',
    `Généré par \`pnpm job offres-lidl\` le ${day(today)}.${today.slice(0, 4)} sur l'instantané publiable Lidl (collecte du ${day(snap.collectedAt.slice(0, 10))}) : ${current.length} offres en cours ou annoncées, ${rules.length} règles revues (\`offerRules\`, data/matching/reviewed.json).`,
    '',
    'Une offre n’est reliée que si **tous** les critères de la règle sont remplis sur les informations publiées avec l’offre : désignation (sans la marque), absence de variante exclue ou indéterminée (« diverses sortes »), contenance admise dans la même unité que le besoin (jamais de pièces converties en grammes) et statut bio. Une offre reliée ne compte que par **ses propres** promotions (dates, prix, carte, région, source) ; son prix « au lieu de » n’est pas repris comme prix normal et rien n’est prolongé d’une semaine à l’autre. Les offres « à vérifier » ne sont jamais utilisées par le comparateur.',
    '',
    `## Offres reliées (${linked.length}, dont ${newlyLinked} nouvelle${newlyLinked > 1 ? 's' : ''})`,
    '',
    'Une offre déjà validée par identifiant (décision antérieure, prioritaire) est confirmée par la règle ; elle aussi ne vaut que par ses propres promotions.',
    '',
    '| Offre | Désignation publiée | Contenance | Besoin | Pour couvrir le besoin | Prix d’action, dates, région | Règle | Lien |',
    '|---|---|---|---|---|---|---|---|',
    ...(linked.length ? linked : ['| — | aucune | | | | | | |']),
    '',
    `## À vérifier (${toReview.length}) : désignation reconnue, critère non rempli`,
    '',
    '| Offre | Désignation publiée | Contenance | Besoin visé | Motif | Prix d’action, dates, région |',
    '|---|---|---|---|---|---|',
    ...(toReview.length ? toReview : ['| — | aucune | | | | |']),
    '',
    `Autres offres (${unrelated}) : aucune règle ne concerne leur désignation (articles hors des 50 besoins, ou désignation différente : « aucun équivalent trouvé dans les sources examinées » ne signifie pas que Lidl ne vend pas le produit).`,
    '',
    '## Règles revues',
    '',
    '| Règle | Besoin | Désignations | Contenances admises | Exclusions | Justification |',
    '|---|---|---|---|---|---|',
    ...rules.map((r: OfferRule) => `| \`${r.id}\` | \`${r.canonicalSlug}\` | ${r.designations.join(' ; ')} | ${r.packs.join(', ')} | ${[...(r.exclude ?? []).map((w) => w.trim()), r.organic === false ? 'bio' : ''].filter(Boolean).join(', ') || '—'} | ${r.justification} |`),
    '',
  ];
  const path = join(dataDir, '..', 'docs', 'OFFRES_LIDL.md');
  await writeFile(path, `${lines.join('\n')}\n`);
  ctx.log.info('Offres Lidl', { current: current.length, linked: linked.length, newlyLinked, toReview: toReview.length, unrelated, path });
}
