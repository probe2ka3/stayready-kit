/**
 * Analyse des détours (« faut-il ajouter ce magasin à mon parcours ? »).
 *
 * Pour chaque profil de prix absent du plan de référence, on cherche le meilleur plan
 * qui l'inclut, en réoptimisant **conjointement** l'affectation des articles et l'ordre
 * de visite : l'ajout d'un magasin peut rendre un autre arrêt inutile (remplacement),
 * et la succursale retenue est celle qui s'insère le mieux dans l'itinéraire.
 *
 * Résultat par magasin : articles concernés et économie par article, économie brute sur
 * les achats, surcoût de déplacement (km, temps, coût), économie nette, et décision au
 * regard du seuil d'économie nette fixé par l'utilisateur.
 */

import { HARD_MAX_STORES, optimize, type OptimizerInput, type Plan } from './optimizer';

export interface DetourItem {
  line: number;
  /** Coût de la ligne dans le plan de référence (null si l'article y manquait). */
  baseCents: number | null;
  /** Coût de la ligne dans le magasin ajouté. */
  newCents: number;
  savingCents: number;
}

export interface DetourOption {
  /** Profil de prix ajouté. */
  profileIndex: number;
  /** Succursale retenue dans l'itinéraire recalculé (index dans OptimizerInput.stores). */
  storeIndex: number;
  plan: Plan;
  /** Profils du plan de référence qui ne sont plus visités (remplacés). */
  droppedProfiles: number[];
  items: DetourItem[];
  /** Économie sur les achats des articles présents dans les deux plans, centimes. */
  grossSavingsCents: number;
  /** Prix des articles supplémentaires trouvés grâce au détour (absents du plan de référence). */
  addedItemsCents: number;
  /** Surcoût des déplacements et du temps valorisé, centimes (peut être négatif). */
  extraTravelCostCents: number;
  extraDistanceKm: number;
  /** Minutes supplémentaires : trajet + temps en magasin. */
  extraMinutes: number;
  /** Économie nette = gain sur les articles comparables − surcoût de déplacement. */
  netSavingsCents: number;
  /** Articles supplémentaires trouvés grâce à ce magasin. */
  extraCoveredLines: number;
  /** Proposé si l'économie nette atteint le seuil (sans perte d'article). */
  worthwhile: boolean;
  /** adds_items : le magasin apporte des articles introuvables ailleurs (à juger par l'utilisateur). */
  reason: 'worthwhile' | 'below_threshold' | 'no_net_saving' | 'adds_items';
}

export interface DetourAnalysis {
  options: DetourOption[];
  /** Profils examinés. */
  examined: number;
}

export interface DetourSettings {
  /** Seuil d'économie nette pour proposer un arrêt supplémentaire (centimes). */
  minNetSavingCents: number;
  /** Nombre maximal de propositions renvoyées. */
  limit?: number;
}

/** Coût d'une ligne dans le profil qui la fournit dans un plan. */
function lineCost(input: OptimizerInput, plan: Plan, line: number): number | null {
  const p = plan.assignment[line];
  if (p == null) return null;
  return (input.costs[line] as Array<number | null>)[p] ?? null;
}

export function analyzeDetours(input: OptimizerInput, base: Plan, settings: DetourSettings): DetourAnalysis {
  const present = new Set(input.stores.map((s) => s.profileIndex));
  const inBase = new Set(base.profiles);
  const candidates = [...present].filter((p) => {
    if (inBase.has(p)) return false;
    // Utile seulement si le profil est moins cher sur au moins une ligne, ou apporte une ligne manquante.
    return input.costs.some((row, l) => {
      const c = row[p];
      if (c == null) return false;
      const b = lineCost(input, base, l);
      return b == null || c < b;
    });
  });

  const maxSize = Math.min(base.profiles.length + 1, HARD_MAX_STORES);
  const baseTravel = base.route.travelCostCents + base.route.inStoreCostCents;
  const baseMinutes = base.route.driveMin + base.route.inStoreMin;
  const options: DetourOption[] = [];

  for (const q of candidates) {
    // Réoptimisation conjointe restreinte aux profils du plan de référence + q, q imposé.
    const allowed = new Set([...base.profiles, q]);
    const res = optimize({
      ...input,
      maxStores: maxSize,
      minSavingPerExtraStoreCents: 0,
      requiredProfiles: [q],
      allowedProfiles: [...allowed],
    });
    let best: Plan | null = null;
    for (const plan of res.optimizedByStoreCount) {
      if (!plan || !plan.profiles.includes(q) || plan.coveredLines < base.coveredLines) continue;
      if (!best || plan.coveredLines > best.coveredLines || (plan.coveredLines === best.coveredLines && plan.globalCents < best.globalCents)) {
        best = plan;
      }
    }
    if (!best) continue;
    const items: DetourItem[] = [];
    best.assignment.forEach((p, l) => {
      if (p !== q) return;
      const newCents = (input.costs[l] as Array<number | null>)[q] as number;
      const baseCents = lineCost(input, base, l);
      items.push({ line: l, baseCents, newCents, savingCents: baseCents == null ? 0 : baseCents - newCents });
    });
    const stop = best.route.stops.find((s) => input.stores[s.storeIndex]?.profileIndex === q);
    const extraCovered = best.coveredLines - base.coveredLines;
    let gross = 0;
    let added = 0;
    best.assignment.forEach((p, l) => {
      const now = p == null ? null : ((input.costs[l] as Array<number | null>)[p] ?? null);
      const before = lineCost(input, base, l);
      if (now == null) return;
      if (before == null) added += now;
      else gross += before - now;
    });
    const extraTravel = best.route.travelCostCents + best.route.inStoreCostCents - baseTravel;
    const net = gross - extraTravel;
    const reason: DetourOption['reason'] =
      extraCovered > 0 ? 'adds_items' : net <= 0 ? 'no_net_saving' : net < settings.minNetSavingCents ? 'below_threshold' : 'worthwhile';
    options.push({
      profileIndex: q,
      storeIndex: stop?.storeIndex ?? -1,
      plan: best,
      droppedProfiles: base.profiles.filter((p) => !best.profiles.includes(p)),
      items: items.sort((a, b) => b.savingCents - a.savingCents),
      grossSavingsCents: gross,
      addedItemsCents: added,
      extraTravelCostCents: extraTravel,
      extraDistanceKm: Math.round((best.route.distanceKm - base.route.distanceKm) * 10) / 10,
      extraMinutes: Math.round(best.route.driveMin + best.route.inStoreMin - baseMinutes),
      netSavingsCents: net,
      extraCoveredLines: extraCovered,
      worthwhile: reason === 'worthwhile',
      reason,
    });
  }

  const rank = { worthwhile: 0, adds_items: 1, below_threshold: 2, no_net_saving: 3 } as const;
  options.sort((a, b) => rank[a.reason] - rank[b.reason] || b.netSavingsCents - a.netSavingsCents);
  return { options: options.slice(0, settings.limit ?? 5), examined: candidates.length };
}
