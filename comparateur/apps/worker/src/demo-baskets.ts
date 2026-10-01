import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  buildOfferIndex,
  compareBasket,
  DEFAULT_FRESHNESS,
  DEFAULT_PREFS,
  formatQuantity,
  profileForStore,
  resolveLine,
  sourceInfo,
  storeSpecificIds,
  withCrowDistance,
  zurichToday,
  type BasketLine,
  type CompareRequest,
  type CompareResultDto,
  type LineOption,
  type Store,
  type TravelSettings,
} from '@cabas/core';
import { matchesFor, readLiveSnapshots, readReviewedMatches } from '@cabas/connectors';
import { CHAINS, PRODUCTS } from '@cabas/reference';
import type { JobContext } from './jobs';

interface DemoBasket {
  id: string;
  title: string;
  origin: { lat: number; lon: number; label: string };
  radiusKm: number;
  chains: string[];
  lines: Array<{ productId: string; qty: number }>;
  when: { mode: 'plan'; date: string; time: string | null };
  maxStores: number;
  travel: TravelSettings;
  minSavingPerExtraStoreChf: number;
}

const chf = (cents: number | null | undefined) => (cents == null ? '—' : (cents / 100).toFixed(2));
const kmTxt = (km: number) => `${km.toFixed(1).replace('.', ',')} km`;
const day = (iso: string) => iso.slice(8, 10) + '.' + iso.slice(5, 7);

/**
 * Paniers de démonstration reproductibles (`demo-baskets [--now=ISO] [--out=dossier]`) : rejoue les
 * paniers de `data/demo/baskets.json` sur les prix réels versionnés (instantanés + correspondances
 * revues + succursales OSM), sans serveur ni réseau, et écrit `data/demo/resultats.md`.
 * Avec le même `--now=` et les mêmes instantanés, le résultat est identique.
 */
export async function jobDemoBaskets(ctx: JobContext) {
  const dataDir = ctx.env.dataDir;
  const now = typeof ctx.flags.now === 'string' ? new Date(ctx.flags.now) : ctx.now;
  const basketsFile = typeof ctx.flags.baskets === 'string' ? ctx.flags.baskets : 'baskets.json';
  const def = JSON.parse(await readFile(join(dataDir, 'demo', basketsFile), 'utf8')) as { baskets: DemoBasket[] };
  const snapshots = await readLiveSnapshots(dataDir);
  const products = snapshots.flatMap((s) => s.batch.retailerProducts);
  const { matches } = matchesFor(products, PRODUCTS, await readReviewedMatches(dataDir));
  // --exclude=aldi-api : même calcul qu'en production sans autorisation de la source ;
  // --public : toutes les sources non publiables exclues (Aldi, Denner…).
  const exclude = [
    ...(typeof ctx.flags.exclude === 'string' ? ctx.flags.exclude.split(',').filter(Boolean) : []),
    ...(ctx.flags.public ? snapshots.filter((s) => s.private).map((s) => s.connectorId) : []),
  ];
  const index = buildOfferIndex(
    {
      products,
      matches,
      prices: snapshots.flatMap((s) => s.batch.prices),
      promotions: snapshots.flatMap((s) => s.batch.promotions),
    },
    { excludeConnectors: exclude },
  );
  const allStores = (JSON.parse(await readFile(join(dataDir, 'stores', 'osm-stores.json'), 'utf8')) as { stores: Store[] }).stores;
  const productMap = new Map(PRODUCTS.map((p) => [p.id, p]));
  const chainMap = new Map(CHAINS.map((c) => [c.id, c]));
  const specific = storeSpecificIds(index);
  const excludedChains = new Set(exclude.flatMap((id) => sourceInfo({ connectorId: id, kind: 'retailer_site' }).chainIds ?? []));

  const out: string[] = [
    '# Paniers de démonstration — résultats reproductibles',
    '',
    `Calculé avec \`pnpm job demo-baskets --now=${now.toISOString()}${basketsFile !== 'baskets.json' ? ` --baskets=${basketsFile}` : ''}${exclude.length ? ` --exclude=${exclude.join(',')}` : ''}\` sur les instantanés versionnés`,
    `(${snapshots.map((s) => `${s.connectorId} du ${s.collectedAt?.slice(0, 10) ?? '?'}`).join(', ')}).`,
    'Prix réels uniquement (aucune donnée de démonstration). Montants en CHF.',
    '',
    'Lecture : « vérifié le JJ.MM » = prix lu à la source ce jour-là, sans garantie ensuite ; au-delà de 7 jours il devient « indicatif », au-delà de 30 jours',
    '(90 pour les relevés communautaires) il est écarté. Actions : dates publiées par l’enseigne ; « fin non publiée » = aucune date de fin connue (jamais',
    'présumée au-delà du dernier jour où l’action a été vue). Un prix régional ou propre à une succursale est signalé comme tel.',
    exclude.length
      ? `**Sources exclues : ${exclude.join(', ')}** — ce que verrait le public en production sans autorisation (docs/DROITS_DONNEES.md).`
      : `Évaluation interne (fichier hors dépôt) : toutes les sources collectées, y compris ${snapshots.filter((s) => s.private).map((s) => s.connectorId).join(', ') || 'aucune source privée'} (usage privé : jamais publiées sans autorisation écrite, docs/COLLECTE_QUOTIDIENNE.md).`,
    '',
  ];
  const json: Array<{ id: string; result: CompareResultDto }> = [];

  // --aujourdhui : courses le jour même (collecte quotidienne), la date du fichier étant fixe.
  if (ctx.flags.aujourdhui) for (const b of def.baskets) b.when = { ...b.when, date: zurichToday(now) };
  // --seuil=CHF : économie nette minimale pour recommander un magasin de plus (défaut : celui du panier).
  const seuil = typeof ctx.flags.seuil === 'string' ? Number(ctx.flags.seuil.replace(',', '.')) : null;
  if (seuil !== null && Number.isFinite(seuil) && seuil >= 0) for (const b of def.baskets) b.minSavingPerExtraStoreChf = seuil;
  for (const b of def.baskets) {
    const lines: BasketLine[] = b.lines.map((l, i) => ({ id: `l${i + 1}`, productId: l.productId, qty: l.qty }));
    const stores = withCrowDistance(b.origin, allStores.filter((s) => b.chains.includes(s.chainId))).filter((s) => s.crowKm <= b.radiusKm);
    const req: CompareRequest = {
      origin: b.origin,
      lines,
      prefs: DEFAULT_PREFS,
      when: b.when,
      maxStores: b.maxStores,
      travel: b.travel,
      minSavingPerExtraStoreCents: Math.round(b.minSavingPerExtraStoreChf * 100),
    };
    const r = await compareBasket(req, { now, products: productMap, chains: chainMap, index, stores });
    json.push({ id: b.id, result: r });
    const tm = r.meta.travelMethod;
    out.push(`## ${b.title}`, '');
    out.push(
      `Départ : ${b.origin.label} · rayon ${b.radiusKm} km · courses le ${day(b.when.date)}.${b.when.date.slice(0, 4)}${b.when.time ? ` à ${b.when.time}` : ''}` +
        ` · ${b.travel.mode === 'car' ? 'voiture' : b.travel.mode}, ${b.travel.costPerKmChf.toFixed(2)} CHF/km, ${b.travel.returnToOrigin ? 'aller-retour' : 'aller simple'}` +
        ` · au plus ${b.maxStores} magasins · ${stores.length} succursales dans le rayon (${r.meta.storesConsidered} retenues).`,
      '',
      tm.estimated
        ? `Trajets **estimés** (pas un itinéraire routier) : vol d'oiseau × ${tm.detourFactor}, durée = ${tm.overheadMin} min + distance à ${tm.speedKmh} km/h.`
        : `Trajets routiers (${tm.provider}).`,
      '',
      '| Solution | Magasins (distance à vol d’oiseau) | Articles | Achats | Trajet | Durée | Coût du trajet | Total (achats + trajet) | Économie sur les achats | Économie nette (après trajet) |',
      '|---|---|---|---|---|---|---|---|---|---|',
    );
    for (const s of r.solutions) {
      const label = s.kind === 'combination' ? `Combinaison${s.retained ? ' (recommandée)' : ' (non recommandée)'}` : `${chainMap.get(s.chainIds[0] ?? '')?.name ?? s.chainIds[0]} seul${s.isReference ? ' (référence)' : ''}`;
      const where = s.stores.map((st) => `${st.chainName} ${st.address || st.name} (${kmTxt(st.crowKm)})`).join(' → ');
      out.push(
        `| ${label} | ${where} | ${s.coveredLines}/${s.totalLines} | ${chf(s.purchaseCents)} | ${kmTxt(s.distanceKm)} | ${Math.round(s.driveMin)} min | ${chf(s.travelCostCents)} | ${s.complete ? chf(s.globalCents) : `(${chf(s.globalCents)}, incomplet)`} | ${s.notComparable ? 'non comparable' : chf(s.grossSavingsCents)} | ${s.notComparable ? 'non comparable' : chf(s.netSavingsCents)} |`,
      );
    }
    out.push(
      '',
      `Seuil de recommandation : ${chf(Math.round(b.minSavingPerExtraStoreChf * 100))} CHF d’économie nette par magasin supplémentaire (réglable : \`--seuil=\`, ou « Économie minimale pour un magasin de plus » dans l’application). ` +
        'En dessous, le gain ne compense généralement pas un arrêt de plus (temps, attente, article en rupture) ; la combinaison reste affichée, non recommandée.',
    );
    for (const s of r.solutions.filter((x) => x.kind === 'combination' && !x.retained && !x.notComparable)) {
      const net = s.netSavingsCents;
      const gross = s.grossSavingsCents;
      if (net === null || gross === null) continue;
      out.push(
        `Combinaison non recommandée : économie nette ${chf(net)} CHF (achats ${chf(gross)} − trajet supplémentaire ${chf(gross - net)}) ${net > 0 ? `< seuil ${chf(Math.round(b.minSavingPerExtraStoreChf * 100))}` : '≤ 0'}.`,
      );
    }
    if (!r.solutions.some((s) => s.kind === 'combination') && r.solutions.filter((s) => s.kind === 'single_chain').length > 1) {
      out.push('', 'Aucune combinaison de magasins n’est moins chère qu’un seul magasin pour ce panier (aucun article n’est moins cher ailleurs).');
    }
    if (r.unavailableEverywhere.length) {
      out.push('', `Introuvables dans toutes les enseignes du périmètre : ${r.unavailableEverywhere.map((u) => u.productName).join(', ')}.`);
    }
    out.push('');

    // Comparaison ligne à ligne : chaque enseigne (succursale la plus proche), paquets et montant payé.
    const today = zurichToday(now);
    const pctx = { asOf: now, today, targetDate: b.when.date, policy: DEFAULT_FRESHNESS, prefs: DEFAULT_PREFS };
    // Toutes les enseignes du périmètre, succursale la plus proche ; une case vide dit pourquoi.
    const chainsShown = b.chains.filter((c) => stores.some((s) => s.chainId === c));
    const nearest = (c: string) => stores.filter((s) => s.chainId === c).sort((x, y) => x.crowKm - y.crowKm)[0] as Store;
    const optimized = r.scenarios.find((s) => s.kind === 'optimized_total');
    const chosen = new Map(optimized?.stops.flatMap((st) => st.items.map((it) => [it.lineId, st.store.chainName] as const)) ?? []);
    out.push(`| Article demandé | ${chainsShown.map((c) => `${chainMap.get(c)?.name} : article, paquets, montant`).join(' | ')} | Retenu |`, `|---|${chainsShown.map(() => '---|').join('')}---|`);
    for (const line of lines) {
      const canonical = productMap.get(line.productId);
      if (!canonical) continue;
      const cells = chainsShown.map((c) => {
        const res = resolveLine(line, canonical, profileForStore(nearest(c), specific), index, pctx);
        if (res.option) return cell(res.option);
        if (excludedChains.has(c)) return 'non affiché (source sans autorisation de réutilisation)';
        if (res.unavailable?.lastKnown) return `prix trop ancien (${day(res.unavailable.lastKnown.observedAt)})`;
        return res.unavailable?.reason === 'filtered_by_preferences' ? 'aucun article conforme' : 'aucune donnée gratuite';
      });
      out.push(`| ${line.qty} × ${canonical.name} (${formatQuantity(canonical.quantity)}) | ${cells.join(' | ')} | ${chosen.get(line.id) ?? 'manquant'} |`);
    }
    out.push('');
    const missing = optimized?.missing ?? [];
    if (missing.length) out.push(`Articles manquants dans la solution retenue : ${missing.map((mi) => `${mi.productName} (${mi.scope === 'everywhere' ? 'aucune enseigne' : 'pas dans les magasins retenus'})`).join(', ')}.`, '');
    if (r.planning) {
      out.push(
        `Même panier aujourd’hui (${day(r.planning.today)}) : ${chf(r.planning.todayPurchaseCents)} ; le ${day(r.planning.targetDate)} : ${chf(r.planning.targetPurchaseCents)}` +
          ` (actions qui commencent : ${r.planning.startingPromotions.length}, qui auront expiré : ${r.planning.expiringPromotions.length}).`,
        '',
      );
    }
    out.push(`Coût du panier selon le jour (magasins retenus, actions publiées uniquement) : ${r.outlook.map((d) => `${day(d.date)} ${chf(d.purchaseCents)}`).join(' · ')}.`, '');
    out.push(`Dates des relevés : ${r.meta.priceDates.map((d) => `${d.chainId} ${day(d.oldest)}–${day(d.newest)}`).join(', ')}. Avertissements : ${r.meta.warnings.join(', ') || 'aucun'}.`, '');
  }

  // Un résultat qui contient des prix de sources non publiables reste hors dépôt (data/private/demo).
  const usesPrivate = snapshots.some((s) => s.private && !exclude.includes(s.connectorId));
  const outDir = typeof ctx.flags.out === 'string' ? ctx.flags.out : join(dataDir, usesPrivate ? 'private' : '', 'demo');
  await mkdir(outDir, { recursive: true });
  const name = typeof ctx.flags.name === 'string' ? ctx.flags.name : ctx.flags.public ? 'resultats-public' : exclude.length ? `resultats-sans-${exclude.join('-')}` : 'resultats';
  await writeFile(join(outDir, `${name}.md`), `${out.join('\n')}\n`);
  if (ctx.flags.json) await writeFile(join(outDir, 'resultats.json'), `${JSON.stringify(json, null, 1)}\n`);
  if (!ctx.flags.quiet) console.log(out.join('\n'));
}

function cell(o: LineOption): string {
  const promo = o.promotion
    ? o.promotion.endIsPresumed
      ? ` ; action ${o.promotion.announced ? 'annoncée' : 'en cours'} depuis le ${day(o.promotion.validFrom)}, fin non publiée`
      : ` ; action ${o.promotion.announced ? 'annoncée' : 'en cours'} ${day(o.promotion.validFrom)}–${day(o.promotion.validTo)}`
    : '';
  const status =
    o.status === 'promo_confirmed' ? `action lue le ${day(o.observedAt)}` : o.status === 'verified' ? `vérifié le ${day(o.observedAt)}` : `indicatif, relevé le ${day(o.observedAt)}`;
  const scope = o.statusReasons.includes('store_specific_price') ? ', prix de cette succursale' : o.statusReasons.includes('zone_price') ? ', prix régional' : '';
  return `${o.productName} ${formatQuantity(o.quantity)} × ${o.packs} = **${chf(o.totalCents)}** (${status}${scope}${promo})`;
}
