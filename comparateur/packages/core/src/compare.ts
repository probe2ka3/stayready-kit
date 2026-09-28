/**
 * Orchestration d'une comparaison : profils de prix → coûts par ligne → matrice de
 * déplacement → optimisation → résultat sérialisable (JSON) pour l'interface.
 */

import { analyzeDetours } from './detours';
import { haversineKm } from './geo';
import { formatDaySchedule, parseOpeningHours, PRESUMED_HOURS, scheduleForDate, type ParsedOpeningHours } from './opening-hours';
import {
  optimize,
  HARD_MAX_STORES,
  type OptimizerStore,
  type Plan,
  type RoutePlan,
  type ScheduleConstraint,
  type StopOpenStatus,
} from './optimizer';
import {
  applicablePromotions,
  describeMechanic,
  profileForStore,
  resolveLine,
  statusRank,
  storeSpecificIds,
  type BasketLine,
  type ComparePrefs,
  type LineOption,
  type LineOutcome,
  type OfferIndex,
  type PriceProfile,
  type PricingContext,
  type UnavailableReason,
} from './pricing';
import { holidayInfo } from './holidays';
import { appleMapsLeg, geoUri, googleMapsRoute } from './navigation';
import { addDays, daysBetween, zurichLocalToInstant, zurichParts, zurichToday } from './time';
import {
  EstimatedMatrixProvider,
  estimatedMatrix,
  type TravelMatrix,
  type TravelMatrixProvider,
  type TravelSettings,
} from './travel';
import {
  DEFAULT_FRESHNESS,
  type CanonicalProduct,
  type Chain,
  type FreshnessPolicy,
  type LatLon,
  type Store,
} from './types';

/** Nombre de succursales conservées par profil de prix (les plus proches ouvertes). */
export const STORES_PER_PROFILE = 5;
/** Horizon maximal de planification (jours). */
export const MAX_PLAN_DAYS = 60;
/** Nombre de jours de l'aperçu « coût selon le jour ». */
export const OUTLOOK_DAYS = 10;

export type WhenInput = { mode: 'now' } | { mode: 'plan'; date: string; time?: string | null };

export interface CompareRequest {
  origin: LatLon & { label?: string | null };
  lines: BasketLine[];
  prefs: ComparePrefs;
  when: WhenInput;
  maxStores: number | null;
  travel: TravelSettings;
  minSavingPerExtraStoreCents: number;
  /** Enseigne habituelle servant de référence pour les économies (facultatif). */
  referenceChainId?: string | null;
  /**
   * Succursales ajoutées par l'utilisateur (détour accepté) : elles sont imposées dans le
   * parcours optimisé, en plus du nombre maximal de magasins choisi.
   */
  includeStores?: string[];
}

export interface CandidateStore extends Store {
  /** Distance à vol d'oiseau depuis le point de départ. */
  crowKm: number;
}

export interface CompareDeps {
  now: Date;
  products: Map<string, CanonicalProduct>;
  chains: Map<string, Chain>;
  index: OfferIndex;
  stores: CandidateStore[];
  matrixProvider?: TravelMatrixProvider;
  policy?: FreshnessPolicy;
}

/* ------------------------------------------------------------------ */
/* DTO de sortie                                                      */
/* ------------------------------------------------------------------ */

export interface StoreDto {
  id: string;
  chainId: string;
  chainName: string;
  chainBadge: string;
  name: string;
  address: string;
  lat: number;
  lon: number;
  crowKm: number;
  hoursOnDate: string | null;
  accessNotes: string | null;
}

export interface ListItemDto {
  lineId: string;
  productId: string;
  productName: string;
  qty: number;
  option: LineOption;
}

export interface StopDto {
  order: number;
  store: StoreDto;
  arrivalOffsetMin: number;
  arrivalTime: string | null;
  legDistanceKm: number;
  legDurationMin: number;
  openStatus: StopOpenStatus;
  items: ListItemDto[];
  subtotalCents: number;
  links: { apple: string; geo: string };
}

export interface MissingLineDto {
  lineId: string;
  productId: string;
  productName: string;
  qty: number;
  /** Indisponible dans tout le périmètre, ou seulement dans les magasins retenus. */
  scope: 'everywhere' | 'selected_stores';
  reasons: UnavailableReason[];
  lastKnown: { chainId: string; priceCents: number; observedAt: string } | null;
}

export interface SavingsDto {
  referenceLabel: string;
  referenceKind: 'best_single_store' | 'user_reference_chain';
  /** Le scénario est la référence elle-même (économie nulle par construction). */
  isReference: boolean;
  /** Articles trouvés par le scénario mais pas par la référence. */
  extraCoveredLines: number;
  /** Articles trouvés par la référence mais pas par le scénario. */
  lostLines: number;
  comparableLines: number;
  purchaseSavingsCents: number;
  travelDeltaCents: number;
  globalSavingsCents: number;
}

export type ScenarioKind = 'single_store' | 'cheapest_products' | 'optimized_total';

/** Proposition d'arrêt supplémentaire (voir detours.ts). */
export interface DetourDto {
  store: StoreDto;
  items: Array<{ lineId: string; productName: string; qty: number; baseCents: number | null; newCents: number; savingCents: number }>;
  /** Magasins du parcours qui ne sont plus nécessaires avec ce détour. */
  droppedStores: StoreDto[];
  grossSavingsCents: number;
  /** Prix des articles introuvables dans le parcours actuel et disponibles dans ce magasin. */
  addedItemsCents: number;
  extraTravelCostCents: number;
  extraDistanceKm: number;
  extraMinutes: number;
  netSavingsCents: number;
  extraCoveredLines: number;
  worthwhile: boolean;
  reason: 'worthwhile' | 'below_threshold' | 'no_net_saving' | 'adds_items';
  /** Résultat si le détour est accepté. */
  resulting: { storeCount: number; purchaseCents: number; globalCents: number };
}

/** « Attendre quelques jours pourrait coûter moins cher » (promotions déjà annoncées uniquement). */
export interface WaitSignalDto {
  fromDate: string;
  date: string;
  daysLater: number;
  basePurchaseCents: number;
  purchaseCents: number;
  savingsCents: number;
  promoLines: number;
}

export interface ScenarioDto {
  kind: ScenarioKind;
  storeCount: number;
  stops: StopDto[];
  missing: MissingLineDto[];
  coveredLines: number;
  totalLines: number;
  purchaseCents: number;
  regularPurchaseCents: number;
  promoSavingsCents: number;
  travel: {
    distanceKm: number;
    driveMin: number;
    inStoreMin: number;
    totalMin: number;
    travelCostCents: number;
    inStoreCostCents: number;
    returnLeg: { distanceKm: number; durationMin: number } | null;
  };
  globalCents: number;
  savings: SavingsDto | null;
  statusCounts: Record<string, number>;
  navigationUrl: string;
  warnings: string[];
  /** Arrêts supplémentaires envisageables (magasin unique et parcours optimisé). */
  detours: DetourDto[];
  /** Succursales imposées par l'utilisateur présentes dans ce scénario. */
  includedStoreIds: string[];
}

export interface SingleStoreRankingDto {
  chainId: string;
  chainName: string;
  chainBadge: string;
  store: StoreDto | null;
  coveredLines: number;
  totalLines: number;
  purchaseCents: number;
  travelCostCents: number | null;
  globalCents: number | null;
  distanceKm: number | null;
  reachable: boolean;
  isComplete: boolean;
}

export interface PromoEventDto {
  lineId: string;
  productName: string;
  chainId: string;
  chainName: string;
  mechanic: string;
  label: string | null;
  validFrom: string;
  validTo: string;
  publishedAt: string;
  endIsPresumed: boolean;
  isDemo: boolean;
}

export interface PlanningDto {
  today: string;
  targetDate: string;
  daysAhead: number;
  /** Coût des mêmes achats (mêmes magasins) aujourd'hui et à la date choisie. */
  todayPurchaseCents: number;
  targetPurchaseCents: number;
  differenceCents: number;
  comparableLines: number;
  startingPromotions: PromoEventDto[];
  expiringPromotions: PromoEventDto[];
  notYetAnnouncedNote: boolean;
}

export interface OutlookDayDto {
  date: string;
  purchaseCents: number;
  coveredLines: number;
  promoLines: number;
}

export interface CompareResultDto {
  meta: {
    generatedAt: string;
    today: string;
    targetDate: string;
    mode: 'now' | 'plan';
    departure: string | null;
    dataMode: 'demo' | 'live' | 'mixed';
    travelProvider: string;
    travelEstimated: boolean;
    storesConsidered: number;
    profilesConsidered: number;
    maxStoresApplied: number;
    stats: { subsetsEvaluated: number; routesComputed: number; durationMs: number };
    warnings: string[];
  };
  totalLines: number;
  scenarios: ScenarioDto[];
  singleStoreRanking: SingleStoreRankingDto[];
  alternativesByStoreCount: Array<{ storeCount: number; globalCents: number; purchaseCents: number; coveredLines: number } | null>;
  planning: PlanningDto | null;
  outlook: OutlookDayDto[];
  waitSignal: WaitSignalDto | null;
}

/* ------------------------------------------------------------------ */

function formatAddress(s: Store): string {
  const street = s.street ?? '';
  const city = [s.zip, s.city].filter(Boolean).join(' ');
  return [street, city].filter(Boolean).join(', ');
}

export class CompareError extends Error {
  constructor(
    public readonly code: 'invalid_date' | 'empty_basket' | 'too_far_ahead',
    message: string,
  ) {
    super(message);
  }
}

export async function compareBasket(req: CompareRequest, deps: CompareDeps): Promise<CompareResultDto> {
  const started = Date.now();
  const now = deps.now;
  const policy = deps.policy ?? DEFAULT_FRESHNESS;
  const today = zurichToday(now);
  const warnings = new Set<string>();

  // --- Date des courses et contrainte horaire -------------------------------------------
  let targetDate = today;
  let schedule: ScheduleConstraint;
  if (req.when.mode === 'now') {
    schedule = { kind: 'departure', departure: now };
  } else {
    targetDate = req.when.date;
    const ahead = daysBetween(today, targetDate);
    if (ahead < 0) throw new CompareError('invalid_date', 'La date choisie est déjà passée.');
    if (ahead > MAX_PLAN_DAYS) throw new CompareError('too_far_ahead', `Planification limitée à ${MAX_PLAN_DAYS} jours.`);
    if (req.when.time) {
      const departure = zurichLocalToInstant(targetDate, req.when.time);
      if (departure.getTime() < now.getTime() - 5 * 60000) {
        throw new CompareError('invalid_date', "L'heure choisie est déjà passée.");
      }
      schedule = { kind: 'departure', departure };
    } else {
      schedule = { kind: 'date', date: targetDate };
    }
  }
  const holiday = holidayInfo(targetDate);
  if (holiday.status !== 'none') warnings.add(`holiday_${holiday.status}`);

  const lines = req.lines.filter((l) => deps.products.has(l.productId));
  if (lines.length === 0) throw new CompareError('empty_basket', 'Le panier est vide.');

  const ctx: PricingContext = { asOf: now, today, targetDate, policy, prefs: req.prefs };

  // --- Profils de prix et succursales candidates ------------------------------------------
  const specific = storeSpecificIds(deps.index);
  const profiles: PriceProfile[] = [];
  const profileIdx = new Map<string, number>();
  /** Horaires publiés (affichage). */
  const hoursCache = new Map<string, ParsedOpeningHours>();
  /** Horaires utilisés pour le calcul (présumés si inconnus). */
  const effectiveHours = new Map<string, ParsedOpeningHours>();
  const presumed = new Set<string>();
  const storesByProfile = new Map<number, CandidateStore[]>();
  for (const store of deps.stores) {
    const profile = profileForStore(store, specific);
    let idx = profileIdx.get(profile.key);
    if (idx === undefined) {
      idx = profiles.length;
      profiles.push(profile);
      profileIdx.set(profile.key, idx);
    }
    const list = storesByProfile.get(idx) ?? [];
    list.push(store);
    storesByProfile.set(idx, list);
    const parsed = parseOpeningHours(store.openingHours);
    hoursCache.set(store.id, parsed);
    if (parsed.ok) effectiveHours.set(store.id, parsed);
    else {
      effectiveHours.set(store.id, PRESUMED_HOURS);
      presumed.add(store.id);
    }
  }
  if (deps.stores.length === 0) warnings.add('no_stores_in_radius');

  // Détours acceptés : la succursale choisie devient la seule candidate de son profil.
  const included = new Set(req.includeStores ?? []);
  const requiredProfileKeys = new Set<string>();
  for (const [idx, list] of storesByProfile) {
    const chosen = list.filter((st) => included.has(st.id));
    if (chosen.length) {
      storesByProfile.set(idx, chosen.slice(0, 1));
      requiredProfileKeys.add((profiles[idx] as PriceProfile).key);
    }
  }

  // Élagage : succursales fermées toute la journée exclues, puis les N plus proches par profil.
  const scheduleDate = schedule.kind === 'departure' ? zurichParts(schedule.departure).date : targetDate;
  const kept: CandidateStore[] = [];
  for (const [, list] of storesByProfile) {
    const open = list
      .filter((s) => {
        const sch = scheduleForDate(effectiveHours.get(s.id) as ParsedOpeningHours, scheduleDate);
        return sch.kind === 'unknown' || sch.intervals.length > 0;
      })
      .sort((a, b) => a.crowKm - b.crowKm)
      .slice(0, STORES_PER_PROFILE);
    kept.push(...open);
  }

  // --- Coût de chaque ligne dans chaque profil ------------------------------------------
  const outcomes: LineOutcome[][] = lines.map((line) => {
    const canonical = deps.products.get(line.productId) as CanonicalProduct;
    return profiles.map((profile) => resolveLine(line, canonical, profile, deps.index, ctx));
  });
  const costs = outcomes.map((row) => row.map((o) => o.option?.totalCents ?? null));
  const tieRank = outcomes.map((row) => row.map((o) => (o.option ? statusRank(o.option.status) : 9)));
  if (outcomes.some((row) => row.some((o) => o.unavailable?.reason === 'stale_price_excluded'))) {
    warnings.add('stale_prices_excluded');
  }

  // --- Matrice de déplacement ---------------------------------------------------------------
  const points: LatLon[] = [{ lat: req.origin.lat, lon: req.origin.lon }, ...kept.map((s) => ({ lat: s.lat, lon: s.lon }))];
  const provider = deps.matrixProvider ?? new EstimatedMatrixProvider();
  let matrix: TravelMatrix;
  try {
    matrix = await provider.compute(points, req.travel.mode);
  } catch {
    warnings.add('routing_provider_unavailable');
    matrix = estimatedMatrix(points, req.travel.mode);
  }
  if (matrix.estimated) warnings.add('travel_estimated');
  if (req.travel.mode === 'transit') warnings.add('transit_rough_estimate');

  const optimizerStores: OptimizerStore[] = kept.map((s) => ({
    profileIndex: profileIdx.get(profileForStore(s, specific).key) as number,
    hours: effectiveHours.get(s.id) as ParsedOpeningHours,
    presumed: presumed.has(s.id),
  }));

  const requiredProfiles = profiles.flatMap((p, i) =>
    requiredProfileKeys.has(p.key) && optimizerStores.some((st) => st.profileIndex === i) ? [i] : [],
  );
  const optimizerInput = {
    costs,
    tieRank,
    profileCount: profiles.length,
    stores: optimizerStores,
    matrix,
    travel: req.travel,
    schedule,
    maxStores: req.maxStores,
    minSavingPerExtraStoreCents: req.minSavingPerExtraStoreCents,
  };
  const result = optimize(optimizerInput);
  // Détour accepté : parcours optimisé recalculé avec le magasin imposé (un arrêt de plus autorisé).
  if (requiredProfiles.length) {
    const forced = optimize({
      ...optimizerInput,
      maxStores: Math.min((req.maxStores ?? HARD_MAX_STORES) + requiredProfiles.length, HARD_MAX_STORES),
      requiredProfiles,
    });
    result.optimized = forced.optimized;
    result.optimizedByStoreCount = forced.optimizedByStoreCount;
  } else if (included.size) {
    warnings.add('included_store_unavailable');
  }
  if (result.stats.profilesConsidered < profiles.length) warnings.add('profiles_capped');
  const maxStoresApplied = Math.min(req.maxStores ?? HARD_MAX_STORES, HARD_MAX_STORES);
  if (req.maxStores === null) warnings.add('max_stores_capped');

  // --- Construction des DTO -----------------------------------------------------------------
  const storeDto = (s: CandidateStore): StoreDto => {
    const chain = deps.chains.get(s.chainId);
    return {
      id: s.id,
      chainId: s.chainId,
      chainName: chain?.name ?? s.chainId,
      chainBadge: chain?.badge ?? s.chainId.slice(0, 2).toUpperCase(),
      name: s.name,
      address: formatAddress(s),
      lat: s.lat,
      lon: s.lon,
      crowKm: s.crowKm,
      hoursOnDate: formatDaySchedule(hoursCache.get(s.id) as ParsedOpeningHours, scheduleDate),
      accessNotes: s.accessNotes ?? null,
    };
  };

  const departureIso = schedule.kind === 'departure' ? schedule.departure.toISOString() : null;
  const arrivalTime = (offsetMin: number): string | null => {
    if (schedule.kind !== 'departure') return null;
    return new Date(schedule.departure.getTime() + offsetMin * 60000).toISOString();
  };

  const everywhereAvailable = lines.map((_, l) => (outcomes[l] as LineOutcome[]).some((o) => o.option));

  const missingFor = (assignment: Array<number | null>): MissingLineDto[] =>
    lines.flatMap((line, l) => {
      if (assignment[l] !== null && assignment[l] !== undefined) return [];
      const row = outcomes[l] as LineOutcome[];
      const reasons = Array.from(
        new Set(row.map((o) => o.unavailable?.reason).filter((r): r is UnavailableReason => Boolean(r))),
      );
      let lastKnown: MissingLineDto['lastKnown'] = null;
      row.forEach((o, p) => {
        const lk = o.unavailable?.lastKnown;
        if (lk && (!lastKnown || lk.observedAt > lastKnown.observedAt)) {
          lastKnown = { chainId: (profiles[p] as PriceProfile).chainId, ...lk };
        }
      });
      const canonical = deps.products.get(line.productId) as CanonicalProduct;
      return [
        {
          lineId: line.id,
          productId: line.productId,
          productName: canonical.name,
          qty: line.qty,
          scope: everywhereAvailable[l] ? 'selected_stores' : 'everywhere',
          reasons: reasons.length ? reasons : ['no_match'],
          lastKnown,
        },
      ];
    });

  const buildStops = (route: RoutePlan, assignment: Array<number | null>): StopDto[] => {
    let prevPoint: LatLon = req.origin;
    return route.stops.map((stop, i) => {
      const store = kept[stop.storeIndex] as CandidateStore;
      const pIdx = optimizerStores[stop.storeIndex]?.profileIndex as number;
      const items: ListItemDto[] = [];
      lines.forEach((line, l) => {
        if (assignment[l] !== pIdx) return;
        const option = (outcomes[l] as LineOutcome[])[pIdx]?.option;
        if (!option) return;
        items.push({
          lineId: line.id,
          productId: line.productId,
          productName: (deps.products.get(line.productId) as CanonicalProduct).name,
          qty: line.qty,
          option,
        });
      });
      const here = { lat: store.lat, lon: store.lon };
      const links = { apple: appleMapsLeg(prevPoint, here, req.travel.mode), geo: geoUri(here, store.name) };
      prevPoint = here;
      return {
        order: i + 1,
        store: storeDto(store),
        arrivalOffsetMin: Math.round(stop.arrivalOffsetMin),
        arrivalTime: arrivalTime(stop.arrivalOffsetMin),
        legDistanceKm: stop.legDistanceKm,
        legDurationMin: stop.legDurationMin,
        openStatus: stop.openStatus,
        items,
        subtotalCents: items.reduce((a, it) => a + it.option.totalCents, 0),
        links,
      };
    });
  };

  // Référence des économies : enseigne habituelle, sinon meilleur magasin unique (atteignable).
  const reachableSingles = result.singleStore.filter((s) => s.route);
  const bySingleRank = [...reachableSingles].sort(
    (a, b) =>
      b.coveredLines - a.coveredLines ||
      a.purchaseCents + (a.route?.travelCostCents ?? 0) - (b.purchaseCents + (b.route?.travelCostCents ?? 0)),
  );
  let reference = bySingleRank[0] ?? null;
  let referenceKind: SavingsDto['referenceKind'] = 'best_single_store';
  if (req.referenceChainId) {
    const own = [...reachableSingles]
      .filter((s) => (profiles[s.profileIndex] as PriceProfile).chainId === req.referenceChainId)
      .sort((a, b) => b.coveredLines - a.coveredLines || a.purchaseCents - b.purchaseCents)[0];
    if (own) {
      reference = own;
      referenceKind = 'user_reference_chain';
    } else {
      warnings.add('reference_chain_unavailable');
    }
  }
  const referenceLabel = (() => {
    if (!reference?.route) return '';
    const store = kept[reference.route.stops[0]?.storeIndex as number];
    return store ? `${deps.chains.get(store.chainId)?.name ?? store.chainId} (${store.name})` : '';
  })();

  const savingsFor = (plan: Plan): SavingsDto | null => {
    const { assignment, route } = plan;
    if (!reference || !reference.route) return null;
    let comparable = 0;
    let purchaseSavings = 0;
    let extra = 0;
    let lost = 0;
    lines.forEach((_, l) => {
      const a = assignment[l];
      const r = reference.assignment[l];
      if (a != null && r == null) extra++;
      if (a == null && r != null) lost++;
      if (a == null || r == null) return;
      comparable++;
      purchaseSavings += ((costs[l] as Array<number | null>)[r] as number) - ((costs[l] as Array<number | null>)[a] as number);
    });
    const travelDelta =
      route.travelCostCents + route.inStoreCostCents - (reference.route.travelCostCents + reference.route.inStoreCostCents);
    const isReference =
      plan.profiles.length === 1 &&
      plan.profiles[0] === reference.profileIndex &&
      plan.route.stops[0]?.storeIndex === reference.route.stops[0]?.storeIndex;
    return {
      referenceLabel,
      referenceKind,
      isReference,
      extraCoveredLines: extra,
      lostLines: lost,
      comparableLines: comparable,
      purchaseSavingsCents: purchaseSavings,
      travelDeltaCents: travelDelta,
      globalSavingsCents: purchaseSavings - travelDelta,
    };
  };

  const detoursFor = (plan: Plan): DetourDto[] => {
    const analysis = analyzeDetours(optimizerInput, plan, { minNetSavingCents: req.minSavingPerExtraStoreCents, limit: 6 });
    return analysis.options
      .filter((o) => o.reason !== 'no_net_saving' && o.storeIndex >= 0)
      .slice(0, 3)
      .map((o) => ({
        store: storeDto(kept[o.storeIndex] as CandidateStore),
        items: o.items.map((it) => {
          const line = lines[it.line] as BasketLine;
          return {
            lineId: line.id,
            productName: (deps.products.get(line.productId) as CanonicalProduct).name,
            qty: line.qty,
            baseCents: it.baseCents,
            newCents: it.newCents,
            savingCents: it.savingCents,
          };
        }),
        droppedStores: plan.route.stops
          .filter((st) => o.droppedProfiles.includes(optimizerStores[st.storeIndex]?.profileIndex as number))
          .map((st) => storeDto(kept[st.storeIndex] as CandidateStore)),
        grossSavingsCents: o.grossSavingsCents,
        addedItemsCents: o.addedItemsCents,
        extraTravelCostCents: o.extraTravelCostCents,
        extraDistanceKm: o.extraDistanceKm,
        extraMinutes: o.extraMinutes,
        netSavingsCents: o.netSavingsCents,
        extraCoveredLines: o.extraCoveredLines,
        worthwhile: o.worthwhile,
        reason: o.reason,
        resulting: { storeCount: o.plan.profiles.length, purchaseCents: o.plan.purchaseCents, globalCents: o.plan.globalCents },
      }));
  };

  const scenarioFrom = (kind: ScenarioKind, plan: Plan | null): ScenarioDto | null => {
    if (!plan) return null;
    const stops = buildStops(plan.route, plan.assignment);
    const allItems = stops.flatMap((s) => s.items);
    const regular = allItems.reduce((a, it) => a + (it.option.regularTotalCents ?? it.option.totalCents), 0);
    const statusCounts: Record<string, number> = {};
    for (const it of allItems) statusCounts[it.option.status] = (statusCounts[it.option.status] ?? 0) + 1;
    const scenarioWarnings: string[] = [];
    if (stops.some((s) => s.openStatus === 'unknown')) scenarioWarnings.push('opening_hours_unknown');
    if (stops.some((s) => presumed.has(s.store.id))) scenarioWarnings.push('presumed_hours');
    if (plan.coveredLines < lines.length) scenarioWarnings.push('incomplete_basket');
    const stopPoints = stops.map((s) => ({ lat: s.store.lat, lon: s.store.lon }));
    return {
      kind,
      storeCount: stops.length,
      stops,
      missing: missingFor(plan.assignment),
      coveredLines: plan.coveredLines,
      totalLines: lines.length,
      purchaseCents: plan.purchaseCents,
      regularPurchaseCents: regular,
      promoSavingsCents: Math.max(0, regular - plan.purchaseCents),
      travel: {
        distanceKm: plan.route.distanceKm,
        driveMin: plan.route.driveMin,
        inStoreMin: plan.route.inStoreMin,
        totalMin: plan.route.driveMin + plan.route.inStoreMin,
        travelCostCents: plan.route.travelCostCents,
        inStoreCostCents: plan.route.inStoreCostCents,
        returnLeg: plan.route.returnLeg,
      },
      globalCents: plan.globalCents,
      savings: savingsFor(plan),
      statusCounts,
      navigationUrl: googleMapsRoute(req.origin, stopPoints, req.travel.mode, req.travel.returnToOrigin),
      warnings: scenarioWarnings,
      // Le scénario « prix les plus bas » ignore les trajets : pas d'analyse de détour.
      detours: kind === 'cheapest_products' ? [] : detoursFor(plan),
      includedStoreIds: stops.map((st) => st.store.id).filter((id) => included.has(id)),
    };
  };

  const bestSingle = bySingleRank[0];
  const singlePlan: Plan | null = bestSingle?.route
    ? {
        profiles: [bestSingle.profileIndex],
        assignment: bestSingle.assignment,
        coveredLines: bestSingle.coveredLines,
        purchaseCents: bestSingle.purchaseCents,
        route: bestSingle.route,
        globalCents: bestSingle.purchaseCents + bestSingle.route.travelCostCents + bestSingle.route.inStoreCostCents,
      }
    : null;

  const scenarios = [
    scenarioFrom('single_store', singlePlan),
    scenarioFrom('cheapest_products', result.cheapest),
    scenarioFrom('optimized_total', result.optimized),
  ].filter((s): s is ScenarioDto => s !== null);
  if (scenarios.length === 0 && deps.stores.length > 0) warnings.add('no_open_store');

  // Classement « magasin unique » : meilleur profil par enseigne.
  const bestPerChain = new Map<string, (typeof result.singleStore)[number]>();
  for (const s of result.singleStore) {
    const chainId = (profiles[s.profileIndex] as PriceProfile).chainId;
    const cur = bestPerChain.get(chainId);
    const better =
      !cur ||
      (s.route && !cur.route) ||
      (Boolean(s.route) === Boolean(cur.route) &&
        (s.coveredLines > cur.coveredLines ||
          (s.coveredLines === cur.coveredLines && s.purchaseCents < cur.purchaseCents)));
    if (better) bestPerChain.set(chainId, s);
  }
  const singleStoreRanking: SingleStoreRankingDto[] = [...bestPerChain.entries()]
    .map(([chainId, s]) => {
      const chain = deps.chains.get(chainId);
      const firstStop = s.route?.stops[0];
      const store = firstStop ? (kept[firstStop.storeIndex] as CandidateStore) : null;
      return {
        chainId,
        chainName: chain?.name ?? chainId,
        chainBadge: chain?.badge ?? chainId.slice(0, 2).toUpperCase(),
        store: store ? storeDto(store) : null,
        coveredLines: s.coveredLines,
        totalLines: lines.length,
        purchaseCents: s.purchaseCents,
        travelCostCents: s.route ? s.route.travelCostCents + s.route.inStoreCostCents : null,
        globalCents: s.route ? s.purchaseCents + s.route.travelCostCents + s.route.inStoreCostCents : null,
        distanceKm: s.route ? s.route.distanceKm : null,
        reachable: Boolean(s.route),
        isComplete: s.coveredLines === lines.length,
      };
    })
    .sort(
      (a, b) =>
        Number(b.reachable) - Number(a.reachable) ||
        b.coveredLines - a.coveredLines ||
        a.purchaseCents - b.purchaseCents,
    );

  // --- Planification : aujourd'hui vs date choisie ---------------------------------------
  let planning: PlanningDto | null = null;
  const focusPlan = result.optimized ?? result.cheapest;
  if (targetDate > today && focusPlan) {
    const todayCtx: PricingContext = { ...ctx, targetDate: today };
    let todayTotal = 0;
    let targetTotal = 0;
    let comparable = 0;
    lines.forEach((line, l) => {
      const p = focusPlan.assignment[l];
      if (p == null) return;
      const canonical = deps.products.get(line.productId) as CanonicalProduct;
      const nowOption = resolveLine(line, canonical, profiles[p] as PriceProfile, deps.index, todayCtx).option;
      const targetCost = (costs[l] as Array<number | null>)[p];
      if (!nowOption || targetCost == null) return;
      comparable++;
      todayTotal += nowOption.totalCents;
      targetTotal += targetCost;
    });
    planning = {
      today,
      targetDate,
      daysAhead: daysBetween(today, targetDate),
      todayPurchaseCents: todayTotal,
      targetPurchaseCents: targetTotal,
      differenceCents: todayTotal - targetTotal,
      comparableLines: comparable,
      ...promoEvents(lines, focusPlan.profiles, profiles, deps, now, today, targetDate, req.prefs),
      notYetAnnouncedNote: true,
    };
  }

  // --- Aperçu : coût selon le jour (promotions déjà annoncées uniquement) -----------------
  const outlook: OutlookDayDto[] = [];
  if (focusPlan) {
    for (let d = 0; d < OUTLOOK_DAYS; d++) {
      const date = addDays(targetDate, d);
      const dayCtx: PricingContext = { ...ctx, targetDate: date };
      let total = 0;
      let covered = 0;
      let promoLines = 0;
      for (const line of lines) {
        const canonical = deps.products.get(line.productId) as CanonicalProduct;
        let best: LineOption | null = null;
        for (const p of focusPlan.profiles) {
          const o = resolveLine(line, canonical, profiles[p] as PriceProfile, deps.index, dayCtx).option;
          if (o && (!best || o.totalCents < best.totalCents)) best = o;
        }
        if (best) {
          covered++;
          total += best.totalCents;
          if (best.promotion) promoLines++;
        }
      }
      outlook.push({ date, purchaseCents: total, coveredLines: covered, promoLines });
    }
  }

  const waitSignal = computeWaitSignal(outlook, targetDate);

  const anyDemo = scenarios.some((s) => s.stops.some((st) => st.items.some((i) => i.option.isDemo)));
  const anyLive = scenarios.some((s) => s.stops.some((st) => st.items.some((i) => !i.option.isDemo)));
  if (anyDemo) warnings.add('demo_data');

  return {
    meta: {
      generatedAt: now.toISOString(),
      today,
      targetDate,
      mode: req.when.mode,
      departure: departureIso,
      dataMode: anyDemo && anyLive ? 'mixed' : anyDemo ? 'demo' : 'live',
      travelProvider: matrix.provider,
      travelEstimated: matrix.estimated,
      storesConsidered: kept.length,
      profilesConsidered: result.stats.profilesConsidered,
      maxStoresApplied,
      stats: {
        subsetsEvaluated: result.stats.subsetsEvaluated,
        routesComputed: result.stats.routesComputed,
        durationMs: Date.now() - started,
      },
      warnings: [...warnings],
    },
    totalLines: lines.length,
    scenarios,
    singleStoreRanking,
    alternativesByStoreCount: result.optimizedByStoreCount.map((p) =>
      p
        ? {
            storeCount: p.profiles.length,
            globalCents: p.globalCents,
            purchaseCents: p.purchaseCents,
            coveredLines: p.coveredLines,
          }
        : null,
    ),
    planning,
    outlook,
    waitSignal,
  };
}

/**
 * Signal « attendre serait moins cher » : dans les 6 jours suivant la date des courses,
 * premier jour où les mêmes magasins coûtent nettement moins (≥ 1 CHF et ≥ 3 %) grâce à
 * des promotions déjà annoncées, sans perdre d'article. Jamais fondé sur un prix supposé.
 */
export function computeWaitSignal(outlook: OutlookDayDto[], fromDate: string): WaitSignalDto | null {
  const base = outlook.find((d) => d.date === fromDate);
  if (!base || base.purchaseCents <= 0) return null;
  let best: WaitSignalDto | null = null;
  for (const d of outlook) {
    const days = daysBetween(fromDate, d.date);
    if (days <= 0 || days > 6 || d.coveredLines < base.coveredLines || d.promoLines === 0) continue;
    const saving = base.purchaseCents - d.purchaseCents;
    if (saving < 100 || saving < base.purchaseCents * 0.03) continue;
    if (!best || saving > best.savingsCents) {
      best = {
        fromDate,
        date: d.date,
        daysLater: days,
        basePurchaseCents: base.purchaseCents,
        purchaseCents: d.purchaseCents,
        savingsCents: saving,
        promoLines: d.promoLines,
      };
    }
  }
  return best;
}

function promoEvents(
  lines: BasketLine[],
  planProfiles: number[],
  profiles: PriceProfile[],
  deps: CompareDeps,
  now: Date,
  today: string,
  targetDate: string,
  prefs: ComparePrefs,
): { startingPromotions: PromoEventDto[]; expiringPromotions: PromoEventDto[] } {
  const starting: PromoEventDto[] = [];
  const expiring: PromoEventDto[] = [];
  const seen = new Set<string>();
  for (const line of lines) {
    const canonical = deps.products.get(line.productId) as CanonicalProduct;
    for (const p of planProfiles) {
      const profile = profiles[p] as PriceProfile;
      for (const m of deps.index.matchesByCanonical.get(canonical.id) ?? []) {
        const product = deps.index.products.get(m.retailerProductId);
        if (!product || product.chainId !== profile.chainId) continue;
        const list = deps.index.promotionsByProduct.get(product.id);
        const atTarget = applicablePromotions(list, profile, { asOf: now, targetDate, prefs });
        const atToday = applicablePromotions(list, profile, { asOf: now, targetDate: today, prefs });
        const chainName = deps.chains.get(profile.chainId)?.name ?? profile.chainId;
        for (const promo of atTarget) {
          if (promo.validFrom > today && !seen.has(`s${promo.id}`)) {
            seen.add(`s${promo.id}`);
            starting.push(toEvent(line.id, canonical.name, profile.chainId, chainName, promo));
          }
        }
        for (const promo of atToday) {
          if (promo.validTo < targetDate && !seen.has(`e${promo.id}`)) {
            seen.add(`e${promo.id}`);
            expiring.push(toEvent(line.id, canonical.name, profile.chainId, chainName, promo));
          }
        }
      }
    }
  }
  return { startingPromotions: starting, expiringPromotions: expiring };
}

function toEvent(
  lineId: string,
  productName: string,
  chainId: string,
  chainName: string,
  promo: import('./types').Promotion,
): PromoEventDto {
  return {
    lineId,
    productName,
    chainId,
    chainName,
    mechanic: describeMechanic(promo),
    label: promo.label ?? null,
    validFrom: promo.validFrom,
    validTo: promo.validTo,
    publishedAt: promo.publishedAt,
    endIsPresumed: Boolean(promo.endIsPresumed),
    isDemo: promo.isDemo,
  };
}

/** Distance à vol d'oiseau utilitaire pour les adaptateurs de données. */
export function withCrowDistance<T extends Store>(origin: LatLon, stores: T[]): Array<T & { crowKm: number }> {
  return stores.map((s) => ({ ...s, crowKm: haversineKm(origin, { lat: s.lat, lon: s.lon }) }));
}
