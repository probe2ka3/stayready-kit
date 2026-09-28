import { roundTo5Rappen } from './money';
import { confidenceOf, sourceInfo, TIER_RANK, type SourceTier } from './sources';
import { normalizeText, significantTokens } from './text';
import { ageInDays, dateInRange } from './time';
import type {
  CanonicalProduct,
  ChainId,
  DataSource,
  FreshnessPolicy,
  MatchKind,
  PriceObservation,
  PriceStatus,
  ProductAttributes,
  ProductMatch,
  Promotion,
  PromotionType,
  Quantity,
  RetailerProduct,
  SourceReliability,
  Store,
} from './types';
import { normalizedUnitCents, packsNeeded, unitPrice, type UnitPriceBasis } from './units';

/* ------------------------------------------------------------------ */
/* Entrées                                                            */
/* ------------------------------------------------------------------ */

export interface BasketLinePrefs {
  /** Exiger la qualité bio pour cet article. */
  organic?: boolean;
  /** Exiger l'origine suisse pour cet article. */
  swissOrigin?: boolean;
}

export interface BasketLine {
  id: string;
  productId: string;
  qty: number;
  prefs?: BasketLinePrefs;
}

export interface ComparePrefs {
  organicOnly: boolean;
  swissOnly: boolean;
  /** Programmes de fidélité dont l'utilisateur dispose (cumulus, supercard, lidl-plus…). */
  loyaltyPrograms: string[];
  /** Accepter des conditionnements différents (comparés au prix unitaire). */
  allowSimilarPacks: boolean;
  /** Utiliser des prix périmés (déconseillé ; désactivé par défaut). */
  includeStalePrices: boolean;
}

export const DEFAULT_PREFS: ComparePrefs = {
  organicOnly: false,
  swissOnly: false,
  loyaltyPrograms: [],
  allowSimilarPacks: true,
  includeStalePrices: false,
};

/** Ensemble des données tarifaires nécessaires à une comparaison. */
export interface OfferIndex {
  products: Map<string, RetailerProduct>;
  /** Correspondances **validées** par référence normalisée. */
  matchesByCanonical: Map<string, ProductMatch[]>;
  pricesByProduct: Map<string, PriceObservation[]>;
  promotionsByProduct: Map<string, Promotion[]>;
}

export function buildOfferIndex(
  input: {
    products: RetailerProduct[];
    matches: ProductMatch[];
    prices: PriceObservation[];
    promotions: Promotion[];
  },
  opts: { allowBenchmarkSources?: boolean } = {},
): OfferIndex {
  // Sources de comparaison (fournisseur tiers non licencié) : exclues des prix affichés par défaut.
  if (!opts.allowBenchmarkSources) {
    const keep = (s: DataSource) => !sourceInfo(s).benchmarkOnly;
    input = { ...input, prices: input.prices.filter((o) => keep(o.source)), promotions: input.promotions.filter((p) => keep(p.source)) };
  }
  const products = new Map(input.products.map((p) => [p.id, p]));
  const matchesByCanonical = new Map<string, ProductMatch[]>();
  for (const m of input.matches) {
    if (m.status !== 'validated' || !products.has(m.retailerProductId)) continue;
    const list = matchesByCanonical.get(m.canonicalId) ?? [];
    list.push(m);
    matchesByCanonical.set(m.canonicalId, list);
  }
  const pricesByProduct = groupBy(input.prices, (p) => p.retailerProductId);
  const promotionsByProduct = groupBy(input.promotions, (p) => p.retailerProductId);
  return { products, matchesByCanonical, pricesByProduct, promotionsByProduct };
}

function groupBy<T>(items: T[], key: (t: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const it of items) {
    const k = key(it);
    const list = m.get(k);
    if (list) list.push(it);
    else m.set(k, [it]);
  }
  return m;
}

/**
 * Profil de prix : ensemble de succursales partageant exactement les mêmes prix
 * (même enseigne, même zone tarifaire, pas de prix propre à la succursale).
 */
export interface PriceProfile {
  key: string;
  chainId: ChainId;
  zoneId: string | null;
  storeId: string | null;
}

/** Succursales disposant de prix ou promotions spécifiques dans l'index. */
export function storeSpecificIds(index: OfferIndex): Set<string> {
  const ids = new Set<string>();
  for (const list of index.pricesByProduct.values()) for (const o of list) if (o.storeId) ids.add(o.storeId);
  for (const list of index.promotionsByProduct.values()) for (const p of list) if (p.storeId) ids.add(p.storeId);
  return ids;
}

export function profileForStore(store: Store, specific: Set<string>): PriceProfile {
  const storeId = specific.has(store.id) ? store.id : null;
  const zoneId = store.zoneId ?? null;
  return {
    key: `${store.chainId}|${zoneId ?? '*'}|${storeId ?? '*'}`,
    chainId: store.chainId,
    zoneId,
    storeId,
  };
}

export interface PricingContext {
  /** Instant de la requête : aucune donnée observée ou publiée après n'est utilisée. */
  asOf: Date;
  /** Date du jour à Zurich. */
  today: string;
  /** Date des courses (Europe/Zurich). */
  targetDate: string;
  policy: FreshnessPolicy;
  prefs: ComparePrefs;
}

/* ------------------------------------------------------------------ */
/* Sorties                                                            */
/* ------------------------------------------------------------------ */

export type StatusReason =
  | 'demo_data'
  | 'future_date'
  | 'aging_price'
  | 'stale_price'
  | 'promo_end_presumed'
  | 'while_stocks_last'
  | 'loyalty_required'
  | 'pack_size_differs'
  | 'store_specific_price'
  | 'zone_price'
  | 'regular_price_unknown'
  | 'crowd_sourced'
  | 'third_party_source' // prix d'un fournisseur de données tiers (repli)
  | 'fallback_source' // aucune source officielle utilisable : source de niveau inférieur
  | 'source_divergence'; // une autre source indique un prix nettement différent

/** Autre observation disponible pour la même enseigne (conservée, jamais fusionnée). */
export interface SourceAlternative {
  retailerProductId: string;
  productName: string;
  connectorId: string;
  provider: string;
  tier: SourceTier;
  totalCents: number;
  unitPriceCents: number;
  observedAt: string;
  sourceUrl: string | null;
}

/** Écart entre la source retenue et une autre source pour un article de même contenance. */
export interface SourceDivergence {
  /** Écart relatif du prix unitaire (0,2 = 20 %). */
  relativeGap: number;
  other: SourceAlternative;
}

/** Seuil d'écart de prix unitaire entre deux sources au-delà duquel la divergence est signalée. */
export const DIVERGENCE_THRESHOLD = 0.15;

export interface AppliedPromotion {
  id: string;
  type: PromotionType;
  label: string | null;
  validFrom: string;
  validTo: string;
  publishedAt: string;
  whileStocksLast: boolean;
  endIsPresumed: boolean;
  loyaltyProgram: string | null;
  referencePriceCents: number | null;
  /** Description courte : « -20 % », « 3 pour 2 », « dès 2 pièces ». */
  mechanic: string;
  source: DataSource;
  isDemo: boolean;
}

export interface LineOption {
  profileKey: string;
  chainId: ChainId;
  retailerProductId: string;
  productName: string;
  brand: string | null;
  quantity: Quantity;
  attributes: ProductAttributes;
  matchKind: MatchKind;
  packs: number;
  /** Prix normal d'un paquet (null si seul le prix promotionnel est connu). */
  packPriceCents: number | null;
  regularTotalCents: number | null;
  totalCents: number;
  promotion: AppliedPromotion | null;
  status: PriceStatus;
  statusReasons: StatusReason[];
  observedAt: string;
  source: DataSource;
  isDemo: boolean;
  unitPrice: { basis: UnitPriceBasis; cents: number };
  reliability: SourceReliability;
  /** Lieu réel du relevé communautaire (succursale), si généralisé. */
  observedAtPlace: string | null;
  license: string | null;
  sourceUrl: string | null;
  /** Niveau de la source retenue (officiel > fournisseur tiers > communautaire > inconnu). */
  sourceTier: SourceTier;
  sourceProvider: string;
  /** Indice de confiance 0–1 (voir `confidenceOf`). */
  confidence: number;
  /** Autres sources disponibles pour cette enseigne (au plus 3), jamais fusionnées. */
  alternatives: SourceAlternative[];
  divergence: SourceDivergence | null;
}

export type UnavailableReason =
  | 'no_match' // l'enseigne n'a pas d'article correspondant (connu)
  | 'filtered_by_preferences' // articles exclus par les préférences (bio, origine…)
  | 'no_price' // article connu mais aucun prix
  | 'stale_price_excluded'; // seul un prix périmé est connu

export interface LineOutcome {
  option: LineOption | null;
  unavailable: null | {
    reason: UnavailableReason;
    lastKnown?: { priceCents: number; observedAt: string } | null;
  };
}

/* ------------------------------------------------------------------ */
/* Résolution                                                         */
/* ------------------------------------------------------------------ */

const STATUS_RANK: Record<PriceStatus, number> = {
  promo_confirmed: 0,
  verified: 0,
  indicative: 1,
  demo: 1,
  stale: 2,
};
const MATCH_RANK: Record<MatchKind, number> = { gtin: 0, equivalent: 1, similar: 2 };

/** Fiabilité d'une observation (explicite, sinon déduite du type de source). */
export function reliabilityOf(o: Pick<PriceObservation, 'reliability' | 'source'>): SourceReliability {
  if (o.reliability) return o.reliability;
  switch (o.source.kind) {
    case 'open_data':
    case 'receipt':
      return 'crowd';
    case 'third_party':
      return 'third_party';
    case 'manual_survey':
    case 'manual_import':
      return 'survey';
    default:
      return 'official';
  }
}

/** Âge (jours) au-delà duquel une observation est périmée. */
export function staleAfterDays(o: Pick<PriceObservation, 'reliability' | 'source'>, policy: FreshnessPolicy): number {
  return reliabilityOf(o) === 'crowd' ? policy.crowdStaleAfterDays : policy.staleAfterDays;
}

function scopeMatches(o: { zoneId: string | null; storeId: string | null }, profile: PriceProfile): boolean {
  return (o.storeId === null || o.storeId === profile.storeId) && (o.zoneId === null || o.zoneId === profile.zoneId);
}

function scopeRank(o: { zoneId: string | null; storeId: string | null }): number {
  return o.storeId ? 3 : o.zoneId ? 2 : 1;
}

/**
 * Observation de prix applicable : portée la plus précise (succursale > zone > national),
 * en privilégiant les prix non périmés, puis la plus récente. Les observations
 * postérieures à `asOf` sont ignorées.
 */
export function pickObservation(
  list: PriceObservation[] | undefined,
  profile: PriceProfile,
  ctx: Pick<PricingContext, 'asOf' | 'policy'>,
): PriceObservation | null {
  if (!list || list.length === 0) return null;
  const asOfMs = ctx.asOf.getTime();
  let best: PriceObservation | null = null;
  let bestKey: [number, number, number] | null = null;
  for (const o of list) {
    const t = Date.parse(o.observedAt);
    if (!(t <= asOfMs) || !scopeMatches(o, profile)) continue;
    const fresh = ageInDays(o.observedAt, ctx.asOf) <= staleAfterDays(o, ctx.policy) ? 1 : 0;
    const key: [number, number, number] = [fresh, scopeRank(o), t];
    if (!bestKey || compareKeys(key, bestKey) > 0) {
      best = o;
      bestKey = key;
    }
  }
  return best;
}

function compareKeys(a: number[], b: number[]): number {
  for (let i = 0; i < a.length; i++) {
    const d = (a[i] as number) - (b[i] as number);
    if (d !== 0) return d;
  }
  return 0;
}

/** Promotions publiées, dans la portée du profil, valables à la date des courses. */
export function applicablePromotions(
  list: Promotion[] | undefined,
  profile: PriceProfile,
  ctx: Pick<PricingContext, 'asOf' | 'targetDate' | 'prefs'>,
): Promotion[] {
  if (!list) return [];
  const asOfMs = ctx.asOf.getTime();
  return list.filter(
    (p) =>
      Date.parse(p.publishedAt) <= asOfMs &&
      dateInRange(ctx.targetDate, p.validFrom, p.validTo) &&
      scopeMatches(p, profile) &&
      (!p.loyaltyProgram || ctx.prefs.loyaltyPrograms.includes(p.loyaltyProgram)),
  );
}

/**
 * Coût d'achat de `packs` paquets avec une promotion. Renvoie null si la promotion
 * ne s'applique pas à cette quantité ou n'est pas calculable.
 */
export function promotionCost(p: Promotion, packs: number, packPriceCents: number | null): number | null {
  switch (p.type) {
    case 'price':
      return p.promoPriceCents != null ? packs * p.promoPriceCents : null;
    case 'percent':
      if (packPriceCents == null || p.percent == null) return null;
      return packs * roundTo5Rappen(packPriceCents * (1 - p.percent / 100));
    case 'multibuy': {
      if (packPriceCents == null || !p.buyQty || p.payQty == null || p.buyQty <= p.payQty) return null;
      const groups = Math.floor(packs / p.buyQty);
      if (groups === 0) return null;
      return groups * p.payQty * packPriceCents + (packs - groups * p.buyQty) * packPriceCents;
    }
    case 'min_qty_price':
      if (p.promoPriceCents == null || !p.minQty || packs < p.minQty) return null;
      return packs * p.promoPriceCents;
    case 'min_qty_percent':
      if (packPriceCents == null || p.percent == null || !p.minQty || packs < p.minQty) return null;
      return packs * roundTo5Rappen(packPriceCents * (1 - p.percent / 100));
    default:
      return null;
  }
}

export function describeMechanic(p: Promotion): string {
  switch (p.type) {
    case 'price':
      return 'Prix promotionnel';
    case 'percent':
      return `-${formatPercent(p.percent ?? 0)} %`;
    case 'multibuy':
      return `${p.buyQty} pour ${p.payQty}`;
    case 'min_qty_price':
      return `Prix spécial dès ${p.minQty} pièces`;
    case 'min_qty_percent':
      return `-${formatPercent(p.percent ?? 0)} % dès ${p.minQty} pièces`;
    default:
      return 'Promotion';
  }
}

function formatPercent(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1).replace('.', ',');
}

function toApplied(p: Promotion): AppliedPromotion {
  return {
    id: p.id,
    type: p.type,
    label: p.label ?? null,
    validFrom: p.validFrom,
    validTo: p.validTo,
    publishedAt: p.publishedAt,
    whileStocksLast: p.whileStocksLast,
    endIsPresumed: Boolean(p.endIsPresumed),
    loyaltyProgram: p.loyaltyProgram ?? null,
    referencePriceCents: p.referencePriceCents ?? null,
    mechanic: describeMechanic(p),
    source: p.source,
    isDemo: p.isDemo,
  };
}

function attributesSatisfy(
  canonical: CanonicalProduct,
  product: RetailerProduct,
  line: BasketLine,
  prefs: ComparePrefs,
): boolean {
  const wantOrganic = Boolean(canonical.attributes.organic || line.prefs?.organic || prefs.organicOnly);
  const wantSwiss = Boolean(canonical.attributes.swissOrigin || line.prefs?.swissOrigin || prefs.swissOnly);
  if (wantOrganic && !product.attributes.organic) return false;
  if (wantSwiss && !product.attributes.swissOrigin) return false;
  for (const label of canonical.attributes.labels ?? []) {
    if (!(product.attributes.labels ?? []).includes(label)) return false;
  }
  if (canonical.brandRequired) {
    const brand = (product.brand ?? '').trim().toLowerCase();
    if (brand !== canonical.brandRequired.trim().toLowerCase()) return false;
  }
  return product.quantity.unit === canonical.quantity.unit;
}

/**
 * Meilleure offre d'une enseigne (profil de prix) pour une ligne du panier.
 * Ne choisit jamais un article non équivalent : seules les correspondances validées
 * et compatibles avec les préférences sont considérées.
 */
export function resolveLine(
  line: BasketLine,
  canonical: CanonicalProduct,
  profile: PriceProfile,
  index: OfferIndex,
  ctx: PricingContext,
): LineOutcome {
  const matches = (index.matchesByCanonical.get(canonical.id) ?? []).filter(
    (m) => index.products.get(m.retailerProductId)?.chainId === profile.chainId,
  );
  if (matches.length === 0) return { option: null, unavailable: { reason: 'no_match' } };

  const eligible = matches.filter((m) => {
    const product = index.products.get(m.retailerProductId) as RetailerProduct;
    if (m.kind === 'similar' && !ctx.prefs.allowSimilarPacks) return false;
    return attributesSatisfy(canonical, product, line, ctx.prefs);
  });
  if (eligible.length === 0) return { option: null, unavailable: { reason: 'filtered_by_preferences' } };

  const candidates: LineOption[] = [];
  let sawStale: { priceCents: number; observedAt: string } | null = null;
  let sawAnyPrice = false;

  for (const match of eligible) {
    const product = index.products.get(match.retailerProductId) as RetailerProduct;
    const obs = pickObservation(index.pricesByProduct.get(product.id), profile, ctx);
    const promos = applicablePromotions(index.promotionsByProduct.get(product.id), profile, ctx);
    const hasStandalonePromo = promos.some((p) => p.type === 'price' || p.type === 'min_qty_price');
    if (!obs && !hasStandalonePromo) continue;

    const ageDays = obs ? ageInDays(obs.observedAt, ctx.asOf) : 0;
    const stale = obs ? ageDays > staleAfterDays(obs, ctx.policy) : false;
    const obsReliability = obs ? reliabilityOf(obs) : null;
    const crowd = obsReliability === 'crowd';
    const thirdParty = obsReliability === 'third_party';
    if (obs) sawAnyPrice = true;
    if (stale && !ctx.prefs.includeStalePrices) {
      if (!sawStale || Date.parse(obs!.observedAt) > Date.parse(sawStale.observedAt)) {
        sawStale = { priceCents: obs!.priceCents, observedAt: obs!.observedAt };
      }
      // Une promotion confirmée reste utilisable même si le prix normal est périmé.
      if (!hasStandalonePromo) continue;
    }

    const packs = packsNeeded(line.qty, canonical.quantity.amount, product.quantity.amount);
    const usableObs = obs && (!stale || ctx.prefs.includeStalePrices) ? obs : null;
    const packPrice = usableObs ? usableObs.priceCents : null;
    const regularTotal = packPrice != null ? packs * packPrice : null;

    let bestPromo: { promo: Promotion; cost: number } | null = null;
    for (const p of promos) {
      const cost = promotionCost(p, packs, packPrice);
      if (cost == null) continue;
      if (regularTotal != null && cost >= regularTotal) continue;
      if (!bestPromo || cost < bestPromo.cost) bestPromo = { promo: p, cost };
    }
    if (regularTotal == null && !bestPromo) continue;

    const total = bestPromo ? bestPromo.cost : (regularTotal as number);
    const reasons: StatusReason[] = [];
    const isDemo = product.isDemo || Boolean(usableObs?.isDemo) || Boolean(bestPromo?.promo.isDemo);
    let status: PriceStatus;
    if (isDemo) {
      status = 'demo';
      reasons.push('demo_data');
    } else if (bestPromo) {
      status = 'promo_confirmed';
    } else if (stale) {
      // Un prix périmé reste « périmé », même pour une date future.
      status = 'stale';
    } else if (ctx.targetDate > ctx.today) {
      status = 'indicative';
    } else if (ageDays > ctx.policy.verifiedMaxAgeDays || crowd || thirdParty) {
      status = 'indicative';
    } else {
      status = 'verified';
    }
    if (!bestPromo && ctx.targetDate > ctx.today) reasons.push('future_date');
    if (stale) reasons.push('stale_price');
    else if (usableObs && ageDays > ctx.policy.verifiedMaxAgeDays) reasons.push('aging_price');
    if (bestPromo?.promo.endIsPresumed) reasons.push('promo_end_presumed');
    if (bestPromo?.promo.whileStocksLast) reasons.push('while_stocks_last');
    if (bestPromo?.promo.loyaltyProgram) reasons.push('loyalty_required');
    if (match.kind === 'similar' || packs !== line.qty) reasons.push('pack_size_differs');
    if (usableObs?.storeId) reasons.push('store_specific_price');
    else if (usableObs?.zoneId) reasons.push('zone_price');
    if (regularTotal == null) reasons.push('regular_price_unknown');
    if (usableObs && crowd) reasons.push('crowd_sourced');
    if (usableObs && thirdParty) reasons.push('third_party_source');

    const effectivePackPrice = Math.round(total / packs);
    const chosenSource = bestPromo && !usableObs ? bestPromo.promo.source : (usableObs as PriceObservation).source;
    const info = sourceInfo(chosenSource);
    const observedAt = bestPromo && !usableObs ? bestPromo.promo.verifiedAt : (usableObs as PriceObservation).observedAt;
    const option: LineOption = {
      profileKey: profile.key,
      chainId: profile.chainId,
      retailerProductId: product.id,
      productName: product.name,
      brand: product.brand ?? null,
      quantity: product.quantity,
      attributes: product.attributes,
      matchKind: match.kind,
      packs,
      packPriceCents: packPrice,
      regularTotalCents: regularTotal,
      totalCents: total,
      promotion: bestPromo ? toApplied(bestPromo.promo) : null,
      status,
      statusReasons: reasons,
      observedAt,
      source: chosenSource,
      isDemo,
      unitPrice: unitPrice(effectivePackPrice, product.quantity),
      reliability: usableObs ? reliabilityOf(usableObs) : reliabilityOf({ source: chosenSource }),
      observedAtPlace: usableObs?.observedAtPlace ?? null,
      license: usableObs?.license ?? info.license,
      sourceUrl: bestPromo && !usableObs ? (bestPromo.promo.sourceUrl ?? null) : (usableObs?.sourceUrl ?? null),
      sourceTier: info.tier,
      sourceProvider: info.provider,
      confidence: confidenceOf({ observedAt, source: chosenSource }, ctx.asOf, ctx.policy, match.kind),
      alternatives: [],
      divergence: null,
    };
    candidates.push(option);
  }

  const best = chooseAmongSources(candidates);
  if (best) return { option: best, unavailable: null };
  if (sawStale) return { option: null, unavailable: { reason: 'stale_price_excluded', lastKnown: sawStale } };
  return { option: null, unavailable: { reason: sawAnyPrice ? 'stale_price_excluded' : 'no_price' } };
}

/**
 * Choix entre les offres d'une même enseigne issues de sources différentes :
 * 1. niveau de source le plus fiable disponible (officiel > tiers > communautaire > inconnu) ;
 * 2. dans ce niveau, l'offre la moins chère (puis la plus fiable, puis la meilleure correspondance).
 * Les autres sources sont conservées comme alternatives ; un écart de prix unitaire supérieur à
 * `DIVERGENCE_THRESHOLD` pour une contenance équivalente est signalé (jamais tranché en silence).
 */
export function chooseAmongSources(candidates: LineOption[]): LineOption | null {
  if (candidates.length === 0) return null;
  const topTier = Math.min(...candidates.map((c) => TIER_RANK[c.sourceTier]));
  let best: LineOption | null = null;
  for (const c of candidates) {
    if (TIER_RANK[c.sourceTier] !== topTier) continue;
    if (!best || isBetter(c, best)) best = c;
  }
  const chosen = best as LineOption;
  const others = new Map<string, LineOption>();
  for (const c of candidates) {
    if (c === chosen || c.source.connectorId === chosen.source.connectorId) continue;
    const prev = others.get(c.source.connectorId);
    if (!prev || isBetter(c, prev)) others.set(c.source.connectorId, c);
  }
  const alternatives: SourceAlternative[] = [...others.values()]
    .sort((a, b) => TIER_RANK[a.sourceTier] - TIER_RANK[b.sourceTier] || a.totalCents - b.totalCents)
    .slice(0, 3)
    .map((c) => ({
      retailerProductId: c.retailerProductId,
      productName: c.productName,
      connectorId: c.source.connectorId,
      provider: c.sourceProvider,
      tier: c.sourceTier,
      totalCents: c.totalCents,
      unitPriceCents: c.unitPrice.cents,
      observedAt: c.observedAt,
      sourceUrl: c.sourceUrl,
    }));
  let divergence: SourceDivergence | null = null;
  for (const alt of alternatives) {
    const other = others.get(alt.connectorId) as LineOption;
    const a = normalizedUnitCents(Math.round(chosen.totalCents / chosen.packs), chosen.quantity);
    const b = normalizedUnitCents(Math.round(other.totalCents / other.packs), other.quantity);
    if (!sameArticle(chosen, other) || !a || !b) continue;
    const gap = Math.abs(b - a) / a;
    if (gap > DIVERGENCE_THRESHOLD && (!divergence || gap > divergence.relativeGap)) {
      divergence = { relativeGap: Math.round(gap * 1000) / 1000, other: alt };
    }
  }
  const reasons = [...chosen.statusReasons];
  if (chosen.sourceTier !== 'first_party' && !chosen.isDemo) reasons.push('fallback_source');
  if (divergence) reasons.push('source_divergence');
  return { ...chosen, statusReasons: reasons, alternatives, divergence };
}

/**
 * Probablement le même article vu par deux sources : même contenance (± 2 %), marques compatibles
 * (identiques ou inconnues) et désignations proches (au moins la moitié des mots significatifs).
 */
export function sameArticle(
  a: Pick<LineOption, 'quantity' | 'brand' | 'productName'>,
  b: Pick<LineOption, 'quantity' | 'brand' | 'productName'>,
): boolean {
  if (a.quantity.unit !== b.quantity.unit) return false;
  if (Math.abs(a.quantity.amount - b.quantity.amount) > a.quantity.amount * 0.02) return false;
  const ba = normalizeText(a.brand ?? '');
  const bb = normalizeText(b.brand ?? '');
  if (ba && bb && ba !== bb) return false;
  const ta = new Set(significantTokens(a.productName));
  const tb = new Set(significantTokens(b.productName));
  if (ta.size === 0 || tb.size === 0) return false;
  let common = 0;
  for (const t of ta) if (tb.has(t)) common++;
  return common / Math.min(ta.size, tb.size) >= 0.5;
}

function isBetter(a: LineOption, b: LineOption): boolean {
  if (a.totalCents !== b.totalCents) return a.totalCents < b.totalCents;
  if (STATUS_RANK[a.status] !== STATUS_RANK[b.status]) return STATUS_RANK[a.status] < STATUS_RANK[b.status];
  return MATCH_RANK[a.matchKind] < MATCH_RANK[b.matchKind];
}

/** Rang de fiabilité (0 = meilleur), utilisé pour départager deux offres au même prix. */
export function statusRank(status: PriceStatus): number {
  return STATUS_RANK[status];
}
