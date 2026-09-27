import { roundTo5Rappen } from './money';
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
  Store,
} from './types';
import { packsNeeded, unitPrice, type UnitPriceBasis } from './units';

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

export function buildOfferIndex(input: {
  products: RetailerProduct[];
  matches: ProductMatch[];
  prices: PriceObservation[];
  promotions: Promotion[];
}): OfferIndex {
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
  | 'regular_price_unknown';

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
    const fresh = ageInDays(o.observedAt, ctx.asOf) <= ctx.policy.staleAfterDays ? 1 : 0;
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

  let best: LineOption | null = null;
  let sawStale: { priceCents: number; observedAt: string } | null = null;
  let sawAnyPrice = false;

  for (const match of eligible) {
    const product = index.products.get(match.retailerProductId) as RetailerProduct;
    const obs = pickObservation(index.pricesByProduct.get(product.id), profile, ctx);
    const promos = applicablePromotions(index.promotionsByProduct.get(product.id), profile, ctx);
    const hasStandalonePromo = promos.some((p) => p.type === 'price' || p.type === 'min_qty_price');
    if (!obs && !hasStandalonePromo) continue;

    const ageDays = obs ? ageInDays(obs.observedAt, ctx.asOf) : 0;
    const stale = obs ? ageDays > ctx.policy.staleAfterDays : false;
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
    } else if (ctx.targetDate > ctx.today) {
      status = 'indicative';
    } else if (stale) {
      status = 'stale';
    } else if (ageDays > ctx.policy.verifiedMaxAgeDays) {
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

    const effectivePackPrice = Math.round(total / packs);
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
      observedAt: bestPromo && !usableObs ? bestPromo.promo.verifiedAt : (usableObs as PriceObservation).observedAt,
      source: bestPromo && !usableObs ? bestPromo.promo.source : (usableObs as PriceObservation).source,
      isDemo,
      unitPrice: unitPrice(effectivePackPrice, product.quantity),
    };
    if (!best || isBetter(option, best)) best = option;
  }

  if (best) return { option: best, unavailable: null };
  if (sawStale) return { option: null, unavailable: { reason: 'stale_price_excluded', lastKnown: sawStale } };
  return { option: null, unavailable: { reason: sawAnyPrice ? 'stale_price_excluded' : 'no_price' } };
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
