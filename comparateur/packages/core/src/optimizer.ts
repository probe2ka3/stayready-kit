/**
 * Optimisation combinée panier + itinéraire (« Traveling Purchaser Problem »).
 *
 * Modèle
 * - Chaque succursale appartient à un **profil de prix** (enseigne + zone tarifaire
 *   + éventuels prix propres à la succursale). Deux succursales d'un même profil ont
 *   exactement les mêmes prix : visiter les deux n'apporte rien.
 * - Pour un ensemble S de profils, chaque ligne du panier est achetée dans le profil
 *   de S où elle coûte le moins (pas de contrainte de capacité → affectation exacte).
 * - L'itinéraire visite une succursale par profil de S (problème du voyageur de
 *   commerce généralisé), départ du point d'origine et retour optionnel.
 *
 * Algorithme (exact sur l'espace réduit décrit dans docs/ALGORITHMES.md)
 * 1. Énumération des ensembles S de taille ≤ K (K = maximum demandé, plafonné à 5),
 *    en éliminant les ensembles « redondants » (un profil qui n'est le moins cher
 *    pour aucune ligne est inutile : l'ensemble sans lui est au moins aussi bon).
 * 2. Tri par couverture (nombre d'articles trouvés) puis par borne inférieure
 *    coût d'achat + aller-retour vers le profil le plus éloigné ; élagage dès que la
 *    borne dépasse la meilleure solution trouvée.
 * 3. Pour chaque ensemble retenu, programmation dynamique de Held-Karp généralisée
 *    sur (profils visités, dernière succursale) avec contrôle des horaires d'ouverture
 *    à l'heure d'arrivée estimée.
 */

import type { OpenStatus, ParsedOpeningHours } from './opening-hours';
import { scheduleForDate } from './opening-hours';
import { addDays, zurichLocalToInstant, zurichParts } from './time';
import type { TravelMatrix, TravelSettings } from './travel';

export const HARD_MAX_STORES = 5;
export const MAX_PROFILES = 16;

export type ScheduleConstraint =
  /** Heure de départ connue : chaque magasin doit être ouvert pendant la visite. */
  | { kind: 'departure'; departure: Date }
  /** Jour connu, heure libre : exclut les magasins fermés toute la journée. */
  | { kind: 'date'; date: string }
  | { kind: 'none' };

export interface OptimizerStore {
  profileIndex: number;
  hours: ParsedOpeningHours;
  /**
   * Horaires présumés (succursale sans horaires connus) : « ouvert » selon les
   * horaires présumés est rapporté comme « non vérifié », « fermé » exclut la visite.
   */
  presumed?: boolean;
}

export interface OptimizerInput {
  /** Coût (centimes) de chaque ligne dans chaque profil, null si indisponible. */
  costs: Array<Array<number | null>>;
  /** Rang de fiabilité (plus petit = meilleur) pour départager les égalités de prix. */
  tieRank?: number[][];
  profileCount: number;
  /** Succursales candidates ; l'index i correspond à l'index i + 1 de la matrice (0 = départ). */
  stores: OptimizerStore[];
  matrix: TravelMatrix;
  travel: TravelSettings;
  schedule: ScheduleConstraint;
  /** Nombre maximal de magasins (null = pas de maximum, plafonné à HARD_MAX_STORES). */
  maxStores: number | null;
  /** Économie minimale exigée pour chaque magasin supplémentaire (centimes). */
  minSavingPerExtraStoreCents: number;
  /** Profils imposés dans chaque plan multi-magasins (magasin accepté par l'utilisateur). */
  requiredProfiles?: number[];
  /** Restreint les profils utilisables (analyse de détour). */
  allowedProfiles?: number[];
}

export type StopOpenStatus = OpenStatus | 'not_checked';

export interface RouteStop {
  storeIndex: number;
  /** Minutes depuis le départ jusqu'à l'arrivée au magasin. */
  arrivalOffsetMin: number;
  legDistanceKm: number;
  legDurationMin: number;
  openStatus: StopOpenStatus;
}

export interface RoutePlan {
  stops: RouteStop[];
  returnLeg: { distanceKm: number; durationMin: number } | null;
  distanceKm: number;
  driveMin: number;
  inStoreMin: number;
  /** Coût des déplacements (km + temps de trajet valorisé), centimes. */
  travelCostCents: number;
  /** Valorisation du temps passé en magasin (0 sauf choix explicite), centimes. */
  inStoreCostCents: number;
}

export interface Plan {
  profiles: number[];
  assignment: Array<number | null>;
  coveredLines: number;
  purchaseCents: number;
  route: RoutePlan;
  /** Achats + déplacements + temps valorisé. */
  globalCents: number;
}

export interface SingleStorePlan {
  profileIndex: number;
  coveredLines: number;
  purchaseCents: number;
  assignment: Array<number | null>;
  route: RoutePlan | null;
}

export interface OptimizerResult {
  singleStore: SingleStorePlan[];
  cheapest: Plan | null;
  optimized: Plan | null;
  /** Meilleur coût global pour 1, 2, … K magasins (aide à juger l'intérêt d'un détour). */
  optimizedByStoreCount: Array<Plan | null>;
  /** Nombre de lignes disponibles dans au moins un profil. */
  maxCoverage: number;
  stats: { subsetsEvaluated: number; routesComputed: number; profilesConsidered: number };
}

/* ------------------------------------------------------------------ */
/* Horaires : fenêtres d'ouverture absolues pré-calculées             */
/* ------------------------------------------------------------------ */

type Availability = (arrivalOffsetMin: number) => StopOpenStatus;

function buildAvailability(store: OptimizerStore, schedule: ScheduleConstraint, shopMin: number): Availability {
  if (schedule.kind === 'none') return () => 'not_checked';
  if (store.presumed) {
    const inner = buildAvailability({ ...store, presumed: false }, schedule, shopMin);
    return (offset) => {
      const st = inner(offset);
      return st === 'open' ? 'unknown' : st;
    };
  }
  if (schedule.kind === 'date') {
    const s = scheduleForDate(store.hours, schedule.date);
    const status: OpenStatus = s.kind === 'unknown' ? 'unknown' : s.intervals.length > 0 ? 'open' : 'closed';
    return () => status;
  }
  const departureMs = schedule.departure.getTime();
  const day = zurichParts(schedule.departure).date;
  // Fenêtres absolues pour la veille (débordement de nuit), le jour même et le lendemain.
  const windows: Array<[number, number]> = [];
  const unknownDays = new Set<string>();
  for (const offset of [-1, 0, 1]) {
    const date = addDays(day, offset);
    const sch = scheduleForDate(store.hours, date);
    if (sch.kind === 'unknown') {
      unknownDays.add(date);
      continue;
    }
    for (const [a, b] of sch.intervals) windows.push([minuteToInstant(date, a), minuteToInstant(date, b)]);
  }
  return (arrivalOffsetMin: number) => {
    const arr = departureMs + arrivalOffsetMin * 60000;
    const end = arr + shopMin * 60000;
    if (unknownDays.has(zurichParts(new Date(arr)).date)) return 'unknown';
    return windows.some(([s, e]) => s <= arr && end <= e) ? 'open' : 'closed';
  };
}

function minuteToInstant(date: string, minutes: number): number {
  const dayShift = Math.floor(minutes / 1440);
  const m = minutes - dayShift * 1440;
  const d = dayShift ? addDays(date, dayShift) : date;
  const hh = String(Math.floor(m / 60)).padStart(2, '0');
  const mm = String(m % 60).padStart(2, '0');
  return zurichLocalToInstant(d, `${hh}:${mm}`).getTime();
}

/* ------------------------------------------------------------------ */
/* Itinéraire : Held-Karp généralisé                                  */
/* ------------------------------------------------------------------ */

interface RouteContext {
  input: OptimizerInput;
  storesByProfile: number[][];
  availability: Availability[];
}

function legCostFloat(distKm: number, durMin: number, s: TravelSettings): number {
  return distKm * s.costPerKmChf * 100 + (durMin / 60) * s.valueOfTimeChfPerHour * 100;
}

function inStoreValue(stops: number, s: TravelSettings): number {
  if (!s.valueInStoreTime || s.valueOfTimeChfPerHour <= 0) return 0;
  return ((stops * s.minutesPerStore) / 60) * s.valueOfTimeChfPerHour * 100;
}

/** Meilleur itinéraire visitant exactement une succursale de chaque profil de `profileSet`. */
export function bestRoute(profileSet: number[], ctx: RouteContext): RoutePlan | null {
  const { input, storesByProfile, availability } = ctx;
  const { matrix, travel } = input;
  const m = profileSet.length;
  if (m === 0) return null;
  const nodeStore: number[] = [];
  const nodeCluster: number[] = [];
  profileSet.forEach((p, c) => {
    for (const s of storesByProfile[p] ?? []) {
      nodeStore.push(s);
      nodeCluster.push(c);
    }
  });
  const N = nodeStore.length;
  if (N === 0) return null;
  const states = (1 << m) * N;
  const cost = new Float64Array(states).fill(Number.POSITIVE_INFINITY);
  const leave = new Float64Array(states); // minutes écoulées au départ du magasin
  const prev = new Int32Array(states).fill(-1);
  const shop = travel.minutesPerStore;
  const EPS = 1e-9;

  for (let j = 0; j < N; j++) {
    const s = nodeStore[j] as number;
    const d = (matrix.distKm[0] as number[])[s + 1] as number;
    const t = (matrix.durMin[0] as number[])[s + 1] as number;
    if ((availability[s] as Availability)(t) === 'closed') continue;
    const idx = (1 << (nodeCluster[j] as number)) * N + j;
    cost[idx] = legCostFloat(d, t, travel);
    leave[idx] = t + shop;
  }

  const full = (1 << m) - 1;
  for (let mask = 1; mask <= full; mask++) {
    for (let j = 0; j < N; j++) {
      const cur = mask * N + j;
      const cj = cost[cur] as number;
      if (cj === Number.POSITIVE_INFINITY) continue;
      const sj = nodeStore[j] as number;
      const rowD = matrix.distKm[sj + 1] as number[];
      const rowT = matrix.durMin[sj + 1] as number[];
      for (let k = 0; k < N; k++) {
        const ck = nodeCluster[k] as number;
        if (mask & (1 << ck)) continue;
        const sk = nodeStore[k] as number;
        const t = rowT[sk + 1] as number;
        const arrival = (leave[cur] as number) + t;
        if ((availability[sk] as Availability)(arrival) === 'closed') continue;
        const nc = cj + legCostFloat(rowD[sk + 1] as number, t, travel);
        const next = (mask | (1 << ck)) * N + k;
        const existing = cost[next] as number;
        if (nc < existing - EPS || (Math.abs(nc - existing) <= EPS && arrival + shop < (leave[next] as number))) {
          cost[next] = nc;
          leave[next] = arrival + shop;
          prev[next] = j;
        }
      }
    }
  }

  let bestJ = -1;
  let bestTotal = Number.POSITIVE_INFINITY;
  let bestLeave = Number.POSITIVE_INFINITY;
  for (let j = 0; j < N; j++) {
    const idx = full * N + j;
    const c = cost[idx] as number;
    if (c === Number.POSITIVE_INFINITY) continue;
    const s = nodeStore[j] as number;
    const back = travel.returnToOrigin
      ? legCostFloat(
          (matrix.distKm[s + 1] as number[])[0] as number,
          (matrix.durMin[s + 1] as number[])[0] as number,
          travel,
        )
      : 0;
    const total = c + back;
    if (total < bestTotal - EPS || (Math.abs(total - bestTotal) <= EPS && (leave[idx] as number) < bestLeave)) {
      bestTotal = total;
      bestJ = j;
      bestLeave = leave[idx] as number;
    }
  }
  if (bestJ < 0) return null;

  const order: number[] = [];
  let mask = full;
  let j = bestJ;
  while (j >= 0) {
    order.unshift(nodeStore[j] as number);
    const p = prev[mask * N + j] as number;
    mask &= ~(1 << (nodeCluster[j] as number));
    j = p;
  }

  // Recalcul détaillé des étapes le long de l'ordre retenu.
  const stops: RouteStop[] = [];
  let elapsed = 0;
  let distance = 0;
  let drive = 0;
  let from = 0;
  for (const s of order) {
    const d = (matrix.distKm[from] as number[])[s + 1] as number;
    const t = (matrix.durMin[from] as number[])[s + 1] as number;
    elapsed += t;
    distance += d;
    drive += t;
    stops.push({
      storeIndex: s,
      arrivalOffsetMin: elapsed,
      legDistanceKm: d,
      legDurationMin: t,
      openStatus: (availability[s] as Availability)(elapsed),
    });
    elapsed += shop;
    from = s + 1;
  }
  let returnLeg: RoutePlan['returnLeg'] = null;
  if (travel.returnToOrigin) {
    const d = (matrix.distKm[from] as number[])[0] as number;
    const t = (matrix.durMin[from] as number[])[0] as number;
    returnLeg = { distanceKm: d, durationMin: t };
    distance += d;
    drive += t;
  }
  return {
    stops,
    returnLeg,
    distanceKm: distance,
    driveMin: drive,
    inStoreMin: order.length * shop,
    travelCostCents: Math.round(legCostFloat(distance, drive, travel)),
    inStoreCostCents: Math.round(inStoreValue(order.length, travel)),
  };
}

/* ------------------------------------------------------------------ */
/* Affectation des lignes à un ensemble de profils                    */
/* ------------------------------------------------------------------ */

interface SubsetEval {
  profiles: number[];
  assignment: Array<number | null>;
  covered: number;
  purchase: number;
  redundant: boolean;
}

function evaluateSubset(profiles: number[], input: OptimizerInput): SubsetEval {
  const used = new Array<boolean>(profiles.length).fill(false);
  const assignment: Array<number | null> = [];
  let covered = 0;
  let purchase = 0;
  for (let l = 0; l < input.costs.length; l++) {
    const row = input.costs[l] as Array<number | null>;
    const tie = input.tieRank?.[l];
    let bestIdx = -1;
    let bestCost = Number.POSITIVE_INFINITY;
    for (let i = 0; i < profiles.length; i++) {
      const p = profiles[i] as number;
      const c = row[p];
      if (c == null) continue;
      if (
        c < bestCost ||
        (c === bestCost && tie && (tie[p] ?? 0) < (tie[profiles[bestIdx] as number] ?? 0))
      ) {
        bestCost = c;
        bestIdx = i;
      }
    }
    if (bestIdx >= 0) {
      used[bestIdx] = true;
      covered++;
      purchase += bestCost;
      assignment.push(profiles[bestIdx] as number);
    } else {
      assignment.push(null);
    }
  }
  return { profiles, assignment, covered, purchase, redundant: used.some((u) => !u) };
}

function* combinations(n: number, k: number): Generator<number[]> {
  const idx = Array.from({ length: k }, (_, i) => i);
  if (k > n || k <= 0) return;
  while (true) {
    yield [...idx];
    let i = k - 1;
    while (i >= 0 && idx[i] === n - k + i) i--;
    if (i < 0) return;
    (idx[i] as number)++;
    for (let j = i + 1; j < k; j++) idx[j] = (idx[j - 1] as number) + 1;
  }
}

/* ------------------------------------------------------------------ */
/* Point d'entrée                                                     */
/* ------------------------------------------------------------------ */

export function optimize(input: OptimizerInput): OptimizerResult {
  const P = input.profileCount;
  const storesByProfile: number[][] = Array.from({ length: P }, () => []);
  input.stores.forEach((s, i) => storesByProfile[s.profileIndex]?.push(i));
  const availability = input.stores.map((s) => buildAvailability(s, input.schedule, input.travel.minutesPerStore));
  const ctx: RouteContext = { input, storesByProfile, availability };
  let routesComputed = 0;
  let subsetsEvaluated = 0;
  const routeCache = new Map<string, RoutePlan | null>();
  const route = (profiles: number[]): RoutePlan | null => {
    const key = profiles.join(',');
    if (routeCache.has(key)) return routeCache.get(key) as RoutePlan | null;
    routesComputed++;
    const r = bestRoute(profiles, ctx);
    routeCache.set(key, r);
    return r;
  };

  // Profils ayant au moins une succursale candidate (et autorisés).
  const allowed = input.allowedProfiles ? new Set(input.allowedProfiles) : null;
  const required = new Set(input.requiredProfiles ?? []);
  const present = Array.from({ length: P }, (_, p) => p).filter(
    (p) => (storesByProfile[p]?.length ?? 0) > 0 && (!allowed || allowed.has(p)),
  );

  // 1. Magasin unique : évaluation de chaque profil.
  const singleStore: SingleStorePlan[] = present.map((p) => {
    const ev = evaluateSubset([p], input);
    subsetsEvaluated++;
    return {
      profileIndex: p,
      coveredLines: ev.covered,
      purchaseCents: ev.purchase,
      assignment: ev.assignment,
      route: route([p]),
    };
  });

  const maxCoverage = input.costs.reduce(
    (acc, row) => acc + (present.some((p) => row[p] != null) ? 1 : 0),
    0,
  );

  // Réduction à MAX_PROFILES profils (les plus complets puis les moins chers).
  let profilesConsidered = present;
  if (present.length > MAX_PROFILES) {
    const ranked = [...singleStore]
      .sort((a, b) => b.coveredLines - a.coveredLines || a.purchaseCents - b.purchaseCents)
      .map((s) => s.profileIndex);
    profilesConsidered = [...new Set([...ranked.filter((p) => required.has(p)), ...ranked])].slice(0, MAX_PROFILES);
  }

  const K = Math.min(input.maxStores ?? HARD_MAX_STORES, HARD_MAX_STORES, profilesConsidered.length);
  const travel = input.travel;

  // Borne inférieure du coût de déplacement : aller-retour vers la succursale la plus proche du profil.
  const minRoundTrip = new Map<number, number>();
  for (const p of profilesConsidered) {
    let best = Number.POSITIVE_INFINITY;
    for (const s of storesByProfile[p] ?? []) {
      const out = legCostFloat(
        (input.matrix.distKm[0] as number[])[s + 1] as number,
        (input.matrix.durMin[0] as number[])[s + 1] as number,
        travel,
      );
      const back = travel.returnToOrigin
        ? legCostFloat(
            (input.matrix.distKm[s + 1] as number[])[0] as number,
            (input.matrix.durMin[s + 1] as number[])[0] as number,
            travel,
          )
        : 0;
      best = Math.min(best, out + back);
    }
    minRoundTrip.set(p, best);
  }

  // 2. Énumération des ensembles non redondants de taille 1..K.
  const bySize: SubsetEval[][] = Array.from({ length: K + 1 }, () => []);
  for (let k = 1; k <= K; k++) {
    for (const combo of combinations(profilesConsidered.length, k)) {
      const profiles = combo.map((i) => profilesConsidered[i] as number);
      if (required.size && ![...required].every((r) => profiles.includes(r))) continue;
      const ev = evaluateSubset(profiles, input);
      subsetsEvaluated++;
      if (!ev.redundant) (bySize[k] as SubsetEval[]).push(ev);
    }
  }

  const toPlan = (ev: SubsetEval, r: RoutePlan): Plan => ({
    profiles: ev.profiles,
    assignment: ev.assignment,
    coveredLines: ev.covered,
    purchaseCents: ev.purchase,
    route: r,
    globalCents: ev.purchase + r.travelCostCents + r.inStoreCostCents,
  });

  // 3a. Scénario « prix des produits le plus bas » : couverture, puis achats, puis trajet.
  let cheapest: Plan | null = null;
  {
    const all = bySize.flat().sort((a, b) => b.covered - a.covered || a.purchase - b.purchase);
    for (const ev of all) {
      if (cheapest && (ev.covered < cheapest.coveredLines || ev.purchase > cheapest.purchaseCents)) break;
      const r = route(ev.profiles);
      if (!r) continue;
      const plan = toPlan(ev, r);
      if (
        !cheapest ||
        plan.route.travelCostCents + plan.route.inStoreCostCents <
          cheapest.route.travelCostCents + cheapest.route.inStoreCostCents ||
        (plan.route.travelCostCents === cheapest.route.travelCostCents && plan.route.driveMin < cheapest.route.driveMin)
      ) {
        cheapest = plan;
      }
    }
  }

  // 3b. Scénario « coût global » : meilleur plan pour chaque nombre de magasins.
  const optimizedByStoreCount: Array<Plan | null> = [];
  for (let k = 1; k <= K; k++) {
    const lb = (ev: SubsetEval) =>
      ev.purchase +
      Math.max(...ev.profiles.map((p) => minRoundTrip.get(p) ?? 0)) +
      inStoreValue(ev.profiles.length, travel);
    const candidates = (bySize[k] as SubsetEval[])
      .map((ev) => ({ ev, bound: lb(ev) }))
      .sort((a, b) => b.ev.covered - a.ev.covered || a.bound - b.bound);
    let best: Plan | null = null;
    for (const { ev, bound } of candidates) {
      if (best && (ev.covered < best.coveredLines || bound >= best.globalCents)) break;
      const r = route(ev.profiles);
      if (!r) continue;
      const plan = toPlan(ev, r);
      // Les candidats sont triés par couverture décroissante : à couverture égale, le moins cher gagne.
      if (!best || (plan.coveredLines === best.coveredLines && plan.globalCents < best.globalCents)) best = plan;
    }
    optimizedByStoreCount.push(best);
  }

  // Choix final : couverture d'abord, puis coût global + seuil d'économie par magasin supplémentaire.
  let optimized: Plan | null = null;
  let optimizedScore = Number.POSITIVE_INFINITY;
  for (const plan of optimizedByStoreCount) {
    if (!plan) continue;
    const score = plan.globalCents + (plan.profiles.length - 1) * input.minSavingPerExtraStoreCents;
    if (
      !optimized ||
      plan.coveredLines > optimized.coveredLines ||
      (plan.coveredLines === optimized.coveredLines && score < optimizedScore)
    ) {
      optimized = plan;
      optimizedScore = score;
    }
  }

  return {
    singleStore,
    cheapest,
    optimized,
    optimizedByStoreCount,
    maxCoverage,
    stats: { subsetsEvaluated, routesComputed, profilesConsidered: profilesConsidered.length },
  };
}
