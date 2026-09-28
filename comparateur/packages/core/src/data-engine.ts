import { describeMechanic, DIVERGENCE_THRESHOLD, reliabilityOf, sameArticle, staleAfterDays } from './pricing';
import { confidenceOf, sourceInfo, type CollectionMethod, type SourceTier } from './sources';
import { ageInDays, zurichToday } from './time';
import type {
  CanonicalProduct,
  ChainId,
  FreshnessPolicy,
  PriceObservation,
  ProductMatch,
  Promotion,
  Quantity,
  RetailerProduct,
  Unit,
} from './types';
import { normalizedUnitCents, unitPrice, type UnitPriceBasis } from './units';

/**
 * Moteur de données multi-sources (docs/DATA_ENGINE.md) : observations enrichies, contrôle de
 * qualité et indicateurs de couverture. Fonctions pures, utilisées par l'administration, le job
 * `data-report` et l'API de données agrégées.
 */

export interface DataSet {
  products: RetailerProduct[];
  /** Correspondances validées (les suggestions sont ignorées). */
  matches: ProductMatch[];
  prices: PriceObservation[];
  promotions: Promotion[];
}

/* ------------------------------------------------------------------ */
/* Observation enrichie                                                */
/* ------------------------------------------------------------------ */

/** Observation de prix normalisée, avec provenance complète (une ligne par prix ou par action). */
export interface PriceRecord {
  id: string;
  kind: 'regular' | 'promotion';
  /** Référence du catalogue (première correspondance validée), sinon null. */
  productId: string | null;
  canonicalIds: string[];
  retailerProductId: string;
  productName: string;
  brand: string | null;
  retailer: ChainId;
  storeId: string | null;
  region: string | null;
  geographicScope: 'national' | 'zone' | 'store';
  /** Prix payé pour un conditionnement selon cet enregistrement (centimes). */
  price: number;
  regularPrice: number | null;
  promotionalPrice: number | null;
  unitPrice: { cents: number; basis: UnitPriceBasis } | null;
  currency: 'CHF';
  quantity: number;
  unit: Unit;
  observedAt: string;
  validFrom: string | null;
  validUntil: string | null;
  sourceType: SourceTier;
  connectorId: string;
  sourceProvider: string;
  sourceUrl: string | null;
  collectionMethod: CollectionMethod;
  confidence: number;
  promotionConditions: string | null;
  loyaltyRequirement: string | null;
  license: string | null;
  isDemo: boolean;
}

function scopeOf(o: { zoneId: string | null; storeId: string | null }): PriceRecord['geographicScope'] {
  return o.storeId ? 'store' : o.zoneId ? 'zone' : 'national';
}

function safeUnitPrice(cents: number, q: Quantity) {
  try {
    return q.amount > 0 ? unitPrice(cents, q) : null;
  } catch {
    return null;
  }
}

function conditionsOf(p: Promotion): string | null {
  const parts: string[] = [describeMechanic(p)];
  if (p.minQty) parts.push(`dès ${p.minQty} pièces`);
  if (p.whileStocksLast) parts.push("jusqu'à épuisement du stock");
  if (p.endIsPresumed) parts.push('fin non publiée');
  if (p.regionNote) parts.push(p.regionNote);
  return parts.join(' · ');
}

export function buildPriceRecords(data: DataSet, now: Date, policy: FreshnessPolicy): PriceRecord[] {
  const products = new Map(data.products.map((p) => [p.id, p]));
  const canon = new Map<string, ProductMatch[]>();
  for (const m of data.matches) {
    if (m.status !== 'validated') continue;
    (canon.get(m.retailerProductId) ?? canon.set(m.retailerProductId, []).get(m.retailerProductId)!).push(m);
  }
  const out: PriceRecord[] = [];
  const base = (rp: RetailerProduct) => {
    const ms = canon.get(rp.id) ?? [];
    return {
      productId: ms[0]?.canonicalId ?? null,
      canonicalIds: ms.map((m) => m.canonicalId),
      retailerProductId: rp.id,
      productName: rp.name,
      brand: rp.brand ?? null,
      retailer: rp.chainId,
      currency: 'CHF' as const,
      quantity: rp.quantity.amount,
      unit: rp.quantity.unit,
      matchKind: ms[0]?.kind ?? null,
    };
  };
  for (const o of data.prices) {
    const rp = products.get(o.retailerProductId);
    if (!rp) continue;
    const info = sourceInfo(o.source);
    const { matchKind, ...b } = base(rp);
    out.push({
      ...b,
      id: o.id,
      kind: 'regular',
      storeId: o.storeId,
      region: o.zoneId,
      geographicScope: scopeOf(o),
      price: o.priceCents,
      regularPrice: o.priceType === 'promo' ? null : o.priceCents,
      promotionalPrice: o.priceType === 'promo' ? o.priceCents : null,
      unitPrice: safeUnitPrice(o.priceCents, rp.quantity),
      observedAt: o.observedAt,
      validFrom: null,
      validUntil: null,
      sourceType: info.tier,
      connectorId: o.source.connectorId,
      sourceProvider: info.provider,
      sourceUrl: o.sourceUrl ?? rp.url ?? null,
      collectionMethod: o.proof === 'receipt' ? 'community_receipt' : o.proof === 'price_tag' ? 'community_price_tag' : info.collectionMethod,
      confidence: confidenceOf(o, now, policy, matchKind),
      promotionConditions: null,
      loyaltyRequirement: null,
      license: o.license ?? info.license,
      isDemo: o.isDemo,
    });
  }
  for (const p of data.promotions) {
    const rp = products.get(p.retailerProductId);
    if (!rp) continue;
    const info = sourceInfo(p.source);
    const { matchKind, ...b } = base(rp);
    const price = p.promoPriceCents ?? null;
    out.push({
      ...b,
      id: p.id,
      kind: 'promotion',
      storeId: p.storeId,
      region: p.zoneId,
      geographicScope: scopeOf(p),
      price: price ?? 0,
      regularPrice: p.referencePriceCents ?? null,
      promotionalPrice: price,
      unitPrice: price != null ? safeUnitPrice(price, rp.quantity) : null,
      observedAt: p.verifiedAt,
      validFrom: p.validFrom,
      validUntil: p.validTo,
      sourceType: info.tier,
      connectorId: p.source.connectorId,
      sourceProvider: info.provider,
      sourceUrl: p.sourceUrl ?? rp.url ?? null,
      collectionMethod: info.collectionMethod,
      confidence: confidenceOf({ observedAt: p.verifiedAt, source: p.source }, now, policy, matchKind),
      promotionConditions: conditionsOf(p),
      loyaltyRequirement: p.loyaltyProgram ?? null,
      license: info.license,
      isDemo: p.isDemo,
    });
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Prix utilisables                                                    */
/* ------------------------------------------------------------------ */

/** Dernier prix utilisable d'un article (prix normal non périmé ou action en cours). */
export interface UsablePrice {
  retailerProductId: string;
  chainId: ChainId;
  connectorId: string;
  tier: SourceTier;
  cents: number;
  /** Centimes par kg, par litre ou par pièce (`normalizedUnitCents`). */
  unitCents: number | null;
  observedAt: string;
  ageDays: number;
  kind: 'regular' | 'promotion';
}

export function usablePrices(data: DataSet, now: Date, policy: FreshnessPolicy): Map<string, UsablePrice[]> {
  const products = new Map(data.products.map((p) => [p.id, p]));
  const today = zurichToday(now);
  const latest = new Map<string, PriceObservation>();
  for (const o of data.prices) {
    if (Date.parse(o.observedAt) > now.getTime()) continue;
    const k = `${o.retailerProductId}|${o.source.connectorId}`;
    const prev = latest.get(k);
    if (!prev || o.observedAt > prev.observedAt) latest.set(k, o);
  }
  const out = new Map<string, UsablePrice[]>();
  const push = (u: UsablePrice) => (out.get(u.retailerProductId) ?? out.set(u.retailerProductId, []).get(u.retailerProductId)!).push(u);
  for (const o of latest.values()) {
    const rp = products.get(o.retailerProductId);
    if (!rp) continue;
    const age = ageInDays(o.observedAt, now);
    if (age > staleAfterDays(o, policy)) continue;
    push({
      retailerProductId: rp.id,
      chainId: rp.chainId,
      connectorId: o.source.connectorId,
      tier: sourceInfo(o.source).tier,
      cents: o.priceCents,
      unitCents: normalizedUnitCents(o.priceCents, rp.quantity),
      observedAt: o.observedAt,
      ageDays: age,
      kind: 'regular',
    });
  }
  for (const p of data.promotions) {
    const rp = products.get(p.retailerProductId);
    if (!rp || p.promoPriceCents == null) continue;
    if (Date.parse(p.publishedAt) > now.getTime() || p.validFrom > today || p.validTo < today) continue;
    if (out.get(rp.id)?.some((u) => u.connectorId === p.source.connectorId)) continue;
    push({
      retailerProductId: rp.id,
      chainId: rp.chainId,
      connectorId: p.source.connectorId,
      tier: sourceInfo(p.source).tier,
      cents: p.promoPriceCents,
      unitCents: normalizedUnitCents(p.promoPriceCents, rp.quantity),
      observedAt: p.verifiedAt,
      ageDays: ageInDays(p.verifiedAt, now),
      kind: 'promotion',
    });
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Couverture et fraîcheur                                             */
/* ------------------------------------------------------------------ */

export interface ChainCoverage {
  chainId: ChainId;
  /** Références du catalogue avec au moins un prix utilisable. */
  references: number;
  referencesFirstParty: number;
  share: number;
  /** Fraîcheur des prix utilisables (dernier prix par article). */
  fresh24h: number;
  fresh48h: number;
  fresh7d: number;
  older: number;
  products: number;
  pricedProducts: number;
}

export interface CoverageKpis {
  at: string;
  catalogSize: number;
  chains: ChainCoverage[];
  /** Nombre de références comparables dans au moins N enseignes. */
  comparable: Record<'2' | '3' | '4' | '5', number>;
  /** Références et enseignes couvertes (détail pour l'export). */
  byReference: Array<{ canonicalId: string; chains: ChainId[] }>;
  freshness: { h24: number; h48: number; d7: number; older: number; total: number };
  byPriority?: Record<string, { size: number; covered2: number }>;
}

export function coverageKpis(
  data: DataSet,
  catalog: Array<Pick<CanonicalProduct, 'id'> & { priority?: string }>,
  chainIds: ChainId[],
  now: Date,
  policy: FreshnessPolicy,
): CoverageKpis {
  const usable = usablePrices(data, now, policy);
  const products = new Map(data.products.map((p) => [p.id, p]));
  const refChains = new Map<string, Set<ChainId>>();
  const refChainsFirstParty = new Map<string, Set<ChainId>>();
  for (const m of data.matches) {
    if (m.status !== 'validated') continue;
    const rp = products.get(m.retailerProductId);
    const u = usable.get(m.retailerProductId);
    if (!rp || !u?.length) continue;
    (refChains.get(m.canonicalId) ?? refChains.set(m.canonicalId, new Set()).get(m.canonicalId)!).add(rp.chainId);
    if (u.some((x) => x.tier === 'first_party')) {
      (refChainsFirstParty.get(m.canonicalId) ?? refChainsFirstParty.set(m.canonicalId, new Set()).get(m.canonicalId)!).add(rp.chainId);
    }
  }
  const catalogIds = new Set(catalog.map((c) => c.id));
  const chains: ChainCoverage[] = chainIds.map((chainId) => {
    let references = 0;
    let referencesFirstParty = 0;
    for (const id of catalogIds) {
      if (refChains.get(id)?.has(chainId)) references++;
      if (refChainsFirstParty.get(id)?.has(chainId)) referencesFirstParty++;
    }
    const buckets = { fresh24h: 0, fresh48h: 0, fresh7d: 0, older: 0 };
    let priced = 0;
    let total = 0;
    for (const p of data.products) {
      if (p.chainId !== chainId) continue;
      total++;
      const u = usable.get(p.id);
      if (!u?.length) continue;
      priced++;
      const age = Math.min(...u.map((x) => x.ageDays));
      if (age <= 1) buckets.fresh24h++;
      else if (age <= 2) buckets.fresh48h++;
      else if (age <= 7) buckets.fresh7d++;
      else buckets.older++;
    }
    return {
      chainId,
      references,
      referencesFirstParty,
      share: catalogIds.size ? Math.round((references / catalogIds.size) * 1000) / 1000 : 0,
      ...buckets,
      products: total,
      pricedProducts: priced,
    };
  });
  const comparable = { '2': 0, '3': 0, '4': 0, '5': 0 };
  const byReference: CoverageKpis['byReference'] = [];
  for (const id of catalogIds) {
    const n = refChains.get(id)?.size ?? 0;
    if (n >= 2) comparable['2']++;
    if (n >= 3) comparable['3']++;
    if (n >= 4) comparable['4']++;
    if (n >= 5) comparable['5']++;
    if (n > 0) byReference.push({ canonicalId: id, chains: [...(refChains.get(id) ?? [])].sort() });
  }
  const freshness = chains.reduce(
    (a, c) => ({ h24: a.h24 + c.fresh24h, h48: a.h48 + c.fresh48h, d7: a.d7 + c.fresh7d, older: a.older + c.older, total: a.total + c.pricedProducts }),
    { h24: 0, h48: 0, d7: 0, older: 0, total: 0 },
  );
  let byPriority: CoverageKpis['byPriority'];
  if (catalog.some((c) => c.priority)) {
    byPriority = {};
    for (const c of catalog) {
      const k = c.priority ?? '-';
      const e = (byPriority[k] ??= { size: 0, covered2: 0 });
      e.size++;
      if ((refChains.get(c.id)?.size ?? 0) >= 2) e.covered2++;
    }
  }
  return { at: now.toISOString(), catalogSize: catalogIds.size, chains, comparable, byReference, freshness, byPriority };
}

/* ------------------------------------------------------------------ */
/* Qualité des données                                                 */
/* ------------------------------------------------------------------ */

export type QualityIssueKind =
  | 'suspicious_price' // prix hors bornes ou très éloigné des autres enseignes
  | 'abnormal_change' // variation brutale entre deux relevés d'une même source
  | 'inconsistent_quantity' // contenance incompatible avec la référence ou le libellé (lot)
  | 'duplicate' // même article, même jour, même source, prix différents
  | 'stale_data' // prix utilisé périmé
  | 'source_divergence' // deux sources, même article, écart > seuil
  | 'promo_as_regular' // prix d'action enregistré comme prix normal
  | 'connector_broken'; // collecte bloquée, en échec ou trop ancienne

export interface QualityIssue {
  kind: QualityIssueKind;
  severity: 'info' | 'warning' | 'error';
  chainId: ChainId | null;
  connectorId: string | null;
  entityId: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface ConnectorHealth {
  connectorId: string;
  status: string;
  collectedAt: string | null;
  message?: string | null;
}

export interface QualityReport {
  at: string;
  counts: Record<QualityIssueKind, number>;
  issues: QualityIssue[];
}

const MULTIPACK = /(\d+)\s*[x×]\s*(\d+(?:[.,]\d+)?)\s*(kg|g|ml|cl|dl|l)\b/i;

/**
 * Contrôle de qualité complet d'un jeu de données. Les seuils sont volontairement prudents :
 * une alerte appelle une vérification, elle ne supprime aucune donnée.
 */
export function dataQualityReport(
  data: DataSet,
  catalog: CanonicalProduct[],
  connectors: ConnectorHealth[],
  now: Date,
  policy: FreshnessPolicy,
  opts: { maxIssuesPerKind?: number; connectorMaxAgeHours?: number } = {},
): QualityReport {
  const issues: QualityIssue[] = [];
  const products = new Map(data.products.map((p) => [p.id, p]));
  const canonical = new Map(catalog.map((c) => [c.id, c]));
  const chainOf = (id: string) => products.get(id)?.chainId ?? null;

  // 1. Connecteurs en panne ou trop anciens.
  const maxAge = (opts.connectorMaxAgeHours ?? 48) / 24;
  for (const c of connectors) {
    const age = c.collectedAt ? ageInDays(c.collectedAt, now) : Infinity;
    if (c.status === 'blocked' || c.status === 'failed' || age > maxAge) {
      issues.push({
        kind: 'connector_broken',
        severity: c.status === 'blocked' ? 'error' : 'warning',
        chainId: null,
        connectorId: c.connectorId,
        entityId: c.connectorId,
        message:
          c.status === 'blocked'
            ? 'Source bloquée : accès refusé (aucun contournement)'
            : c.status === 'failed'
              ? `Dernière collecte en échec${c.message ? ` : ${c.message}` : ''}`
              : `Aucune collecte depuis ${Math.floor(age * 24)} h`,
        details: { status: c.status, collectedAt: c.collectedAt },
      });
    }
  }

  // 2. Doublons, variations brutales, prix hors bornes (par article et par source).
  const series = new Map<string, PriceObservation[]>();
  for (const o of data.prices) {
    const k = `${o.retailerProductId}|${o.source.connectorId}|${o.zoneId ?? '*'}|${o.storeId ?? '*'}`;
    (series.get(k) ?? series.set(k, []).get(k)!).push(o);
    if (o.priceCents < 5 || o.priceCents > 50_000) {
      issues.push({
        kind: 'suspicious_price',
        severity: 'warning',
        chainId: chainOf(o.retailerProductId),
        connectorId: o.source.connectorId,
        entityId: o.id,
        message: `Prix hors bornes : CHF ${(o.priceCents / 100).toFixed(2)}`,
      });
    }
  }
  for (const list of series.values()) {
    list.sort((a, b) => a.observedAt.localeCompare(b.observedAt));
    for (let i = 1; i < list.length; i++) {
      const prev = list[i - 1] as PriceObservation;
      const cur = list[i] as PriceObservation;
      if (prev.observedAt.slice(0, 10) === cur.observedAt.slice(0, 10) && prev.priceCents !== cur.priceCents) {
        issues.push({
          kind: 'duplicate',
          severity: 'warning',
          chainId: chainOf(cur.retailerProductId),
          connectorId: cur.source.connectorId,
          entityId: cur.id,
          message: `Deux prix différents le même jour pour le même article (CHF ${(prev.priceCents / 100).toFixed(2)} / ${(cur.priceCents / 100).toFixed(2)})`,
        });
        continue;
      }
      const change = prev.priceCents > 0 ? (cur.priceCents - prev.priceCents) / prev.priceCents : 0;
      if (Math.abs(change) >= 0.4) {
        issues.push({
          kind: 'abnormal_change',
          severity: 'warning',
          chainId: chainOf(cur.retailerProductId),
          connectorId: cur.source.connectorId,
          entityId: cur.id,
          message: `Variation de ${(change * 100).toFixed(0)} % depuis le relevé du ${prev.observedAt.slice(0, 10)}`,
          details: { previousCents: prev.priceCents, newCents: cur.priceCents },
        });
      }
    }
  }

  // 3. Action enregistrée comme prix normal : prix normal du jour égal à une action en cours
  //    inférieure à son prix « au lieu de ».
  const today = zurichToday(now);
  const promosByProduct = new Map<string, Promotion[]>();
  for (const p of data.promotions) (promosByProduct.get(p.retailerProductId) ?? promosByProduct.set(p.retailerProductId, []).get(p.retailerProductId)!).push(p);
  for (const o of data.prices) {
    if (o.observedAt.slice(0, 10) !== today && zurichToday(new Date(o.observedAt)) !== today) continue;
    const active = (promosByProduct.get(o.retailerProductId) ?? []).filter(
      (p) => p.source.connectorId === o.source.connectorId && p.validFrom <= today && p.validTo >= today && p.promoPriceCents != null,
    );
    const hit = active.find((p) => p.promoPriceCents === o.priceCents && p.referencePriceCents && p.referencePriceCents > o.priceCents);
    if (hit) {
      issues.push({
        kind: 'promo_as_regular',
        severity: 'error',
        chainId: chainOf(o.retailerProductId),
        connectorId: o.source.connectorId,
        entityId: o.id,
        message: `Prix normal égal au prix d'action en cours (au lieu de CHF ${((hit.referencePriceCents ?? 0) / 100).toFixed(2)})`,
      });
    }
  }

  // 4. Contenances : lot lu comme une unité, correspondance incompatible avec la référence.
  for (const rp of data.products) {
    const m = MULTIPACK.exec(rp.name);
    if (m) {
      const each = Number((m[2] as string).replace(',', '.'));
      const unitFactor = { kg: 1000, g: 1, ml: 1, cl: 10, dl: 100, l: 1000 }[(m[3] as string).toLowerCase()] ?? 1;
      const single = each * unitFactor;
      const total = single * Number(m[1]);
      if (Number(m[1]) > 1 && Math.abs(rp.quantity.amount - single) < single * 0.02 && Math.abs(total - single) > single * 0.5) {
        issues.push({
          kind: 'inconsistent_quantity',
          severity: 'error',
          chainId: rp.chainId,
          connectorId: rp.connectorId,
          entityId: rp.id,
          message: `Lot « ${m[0]} » enregistré avec la contenance d'une seule unité`,
        });
      }
    }
  }
  for (const mt of data.matches) {
    if (mt.status !== 'validated') continue;
    const rp = products.get(mt.retailerProductId);
    const c = canonical.get(mt.canonicalId);
    if (!rp || !c) continue;
    const ratio = c.quantity.amount > 0 ? rp.quantity.amount / c.quantity.amount : 0;
    // Écart admis pour une contenance voisine : de 1/6 (bouteille d'un pack de 6) à 5 fois la référence.
    if (rp.quantity.unit !== c.quantity.unit || (mt.kind === 'equivalent' && (ratio < 0.8 || ratio > 1.25)) || ratio < 1 / 6 - 0.001 || ratio > 5) {
      issues.push({
        kind: 'inconsistent_quantity',
        severity: 'warning',
        chainId: rp.chainId,
        connectorId: rp.connectorId,
        entityId: `${mt.canonicalId}|${rp.id}`,
        message: `Contenance ${rp.quantity.amount} ${rp.quantity.unit} incompatible avec la référence ${c.name} (${c.quantity.amount} ${c.quantity.unit})`,
      });
    }
  }

  // 5. Divergences entre sources et prix suspects par rapport aux autres enseignes.
  const usable = usablePrices(data, now, policy);
  const byCanonChain = new Map<string, Array<{ rp: RetailerProduct; u: UsablePrice }>>();
  for (const mt of data.matches) {
    if (mt.status !== 'validated') continue;
    const rp = products.get(mt.retailerProductId);
    if (!rp) continue;
    for (const u of usable.get(rp.id) ?? []) {
      const k = `${mt.canonicalId}|${rp.chainId}`;
      (byCanonChain.get(k) ?? byCanonChain.set(k, []).get(k)!).push({ rp, u });
    }
  }
  const seenPairs = new Set<string>();
  for (const [k, list] of byCanonChain) {
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i]!;
        const b = list[j]!;
        if (a.u.connectorId === b.u.connectorId || a.u.unitCents == null || b.u.unitCents == null) continue;
        if (!sameArticle({ quantity: a.rp.quantity, brand: a.rp.brand ?? null, productName: a.rp.name }, { quantity: b.rp.quantity, brand: b.rp.brand ?? null, productName: b.rp.name })) continue;
        const gap = Math.abs(a.u.unitCents - b.u.unitCents) / Math.min(a.u.unitCents, b.u.unitCents);
        const pair = [a.rp.id, b.rp.id].sort().join('|');
        if (gap <= DIVERGENCE_THRESHOLD || seenPairs.has(pair)) continue;
        seenPairs.add(pair);
        issues.push({
          kind: 'source_divergence',
          severity: 'warning',
          chainId: a.rp.chainId,
          connectorId: null,
          entityId: k,
          message: `${a.u.connectorId} CHF ${(a.u.cents / 100).toFixed(2)} contre ${b.u.connectorId} CHF ${(b.u.cents / 100).toFixed(2)} (écart ${(gap * 100).toFixed(0)} %)`,
          details: { a: { product: a.rp.id, ...a.u }, b: { product: b.rp.id, ...b.u } },
        });
      }
    }
  }
  const byCanon = new Map<string, Array<{ chainId: ChainId; unitCents: number; rp: RetailerProduct }>>();
  for (const [k, list] of byCanonChain) {
    const [canonId] = k.split('|') as [string];
    for (const { rp, u } of list) if (u.unitCents != null && u.tier === 'first_party') (byCanon.get(canonId) ?? byCanon.set(canonId, []).get(canonId)!).push({ chainId: rp.chainId, unitCents: u.unitCents, rp });
  }
  // Prix suspect : hors de [min/3 ; max×3] des prix unitaires les plus bas des autres enseignes
  // (on compare au meilleur prix de chaque enseigne, pas à des articles haut de gamme).
  for (const [canonId, list] of byCanon) {
    const cheapestByChain = new Map<ChainId, number>();
    for (const y of list) cheapestByChain.set(y.chainId, Math.min(cheapestByChain.get(y.chainId) ?? Infinity, y.unitCents));
    for (const x of list) {
      const peers = [...cheapestByChain].filter(([c]) => c !== x.chainId).map(([, v]) => v);
      if (peers.length < 2) continue;
      const lo = Math.min(...peers);
      const hi = Math.max(...peers);
      if (lo > 0 && (x.unitCents > hi * 3 || x.unitCents < lo / 3)) {
        issues.push({
          kind: 'suspicious_price',
          severity: 'warning',
          chainId: x.chainId,
          connectorId: x.rp.connectorId,
          entityId: `${canonId}|${x.rp.id}`,
          message: `Prix unitaire très éloigné des meilleurs prix des autres enseignes pour ${canonical.get(canonId)?.name ?? canonId}`,
          details: { unitCents: x.unitCents, peerLowCents: lo, peerHighCents: hi },
        });
      }
    }
  }

  // 6. Données anciennes : articles rapprochés du catalogue dont le dernier prix est périmé.
  const matchedIds = new Set(data.matches.filter((m) => m.status === 'validated').map((m) => m.retailerProductId));
  const lastObs = new Map<string, PriceObservation>();
  for (const o of data.prices) {
    if (!matchedIds.has(o.retailerProductId)) continue;
    const prev = lastObs.get(o.retailerProductId);
    if (!prev || o.observedAt > prev.observedAt) lastObs.set(o.retailerProductId, o);
  }
  for (const o of lastObs.values()) {
    const limit = staleAfterDays(o, policy);
    const age = ageInDays(o.observedAt, now);
    if (age > limit) {
      issues.push({
        kind: 'stale_data',
        severity: reliabilityOf(o) === 'official' ? 'warning' : 'info',
        chainId: chainOf(o.retailerProductId),
        connectorId: o.source.connectorId,
        entityId: o.retailerProductId,
        message: `Dernier prix du ${o.observedAt.slice(0, 10)} (${Math.floor(age)} jours, limite ${limit})`,
      });
    }
  }

  const counts = {
    suspicious_price: 0,
    abnormal_change: 0,
    inconsistent_quantity: 0,
    duplicate: 0,
    stale_data: 0,
    source_divergence: 0,
    promo_as_regular: 0,
    connector_broken: 0,
  } as Record<QualityIssueKind, number>;
  for (const i of issues) counts[i.kind]++;
  const cap = opts.maxIssuesPerKind ?? 200;
  const kept: QualityIssue[] = [];
  const perKind = new Map<QualityIssueKind, number>();
  const sevRank = { error: 0, warning: 1, info: 2 };
  for (const i of [...issues].sort((a, b) => sevRank[a.severity] - sevRank[b.severity])) {
    const n = perKind.get(i.kind) ?? 0;
    if (n >= cap) continue;
    perKind.set(i.kind, n + 1);
    kept.push(i);
  }
  return { at: now.toISOString(), counts, issues: kept };
}
