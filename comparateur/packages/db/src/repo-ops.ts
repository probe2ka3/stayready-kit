import {
  checkObservation,
  checkPriceJump,
  checkPromotion,
  checkUnitPriceOutlier,
  DEFAULT_FRESHNESS,
  unitPrice,
  zurichToday,
  type Anomaly,
  type Chain,
  type FreshnessPolicy,
  type PriceObservation,
  type Promotion,
  type SourceKind,
  type Unit,
} from '@cabas/core';
import { and, desc, eq, isNull, sql as dsql } from 'drizzle-orm';
import { chunk, type DbHandle } from './client';
import { anomalies, auditLog, importRuns, productMatches } from './schema';

/* ---------------------------------------------------------------- */
/* Journal des imports                                               */
/* ---------------------------------------------------------------- */

export async function startRun(handle: DbHandle, connectorId: string, kind: string, triggeredBy = 'system'): Promise<number> {
  const [row] = await handle.db.insert(importRuns).values({ connectorId, kind, triggeredBy }).returning({ id: importRuns.id });
  return row?.id as number;
}

export async function finishRun(
  handle: DbHandle,
  id: number,
  status: 'success' | 'partial' | 'failed',
  stats: Record<string, unknown>,
  issues: unknown[] = [],
  message: string | null = null,
): Promise<void> {
  await handle.db
    .update(importRuns)
    .set({ status, stats, issues: issues.slice(0, 200), message, finishedAt: new Date().toISOString() })
    .where(eq(importRuns.id, id));
}

export async function listRuns(handle: DbHandle, limit = 50) {
  return handle.db.select().from(importRuns).orderBy(desc(importRuns.startedAt)).limit(limit);
}

/* ---------------------------------------------------------------- */
/* Audit                                                             */
/* ---------------------------------------------------------------- */

export async function audit(
  handle: DbHandle,
  actor: string,
  action: string,
  entityType: string | null,
  entityId: string | null,
  details: Record<string, unknown> = {},
): Promise<void> {
  await handle.db.insert(auditLog).values({ actor, action, entityType, entityId, details });
}

export async function listAudit(handle: DbHandle, limit = 100) {
  return handle.db.select().from(auditLog).orderBy(desc(auditLog.at)).limit(limit);
}

/* ---------------------------------------------------------------- */
/* Qualité des données                                               */
/* ---------------------------------------------------------------- */

export async function recordAnomalies(handle: DbHandle, list: Anomaly[]): Promise<number> {
  let inserted = 0;
  for (const part of chunk(list, 500)) {
    const res = await handle.db
      .insert(anomalies)
      .values(
        part.map((a) => ({
          kind: a.kind,
          severity: a.severity,
          entityType: a.entityType,
          entityId: a.entityId,
          message: a.message,
          details: a.details ?? {},
        })),
      )
      .onConflictDoNothing()
      .returning({ id: anomalies.id });
    inserted += res.length;
  }
  return inserted;
}

export interface QualityReport {
  expiredPromotions: number;
  anomaliesDetected: number;
  anomaliesRecorded: number;
  byKind: Record<string, number>;
}

/**
 * Contrôles périodiques :
 * - passage au statut « expired » des promotions terminées (le moteur ne les applique
 *   de toute façon jamais hors de leur période) ;
 * - détection d'anomalies : prix périmés, dates incohérentes, promotions non
 *   avantageuses, variations brutales, prix unitaires aberrants.
 * Les données de démonstration ne sont contrôlées que pour la cohérence des dates.
 */
export async function runQualityChecks(
  handle: DbHandle,
  now: Date,
  chains: Chain[],
  policy: FreshnessPolicy = DEFAULT_FRESHNESS,
): Promise<QualityReport> {
  const s = handle.sql;
  const today = zurichToday(now);
  const expired = await s`UPDATE promotions SET status = 'expired', updated_at = now() WHERE status = 'active' AND valid_to < ${today}`;
  const found: Anomaly[] = [];
  const chainById = new Map(chains.map((c) => [c.id, c]));

  // Dernières observations par portée (+ la précédente pour détecter les sauts de prix).
  const obsRows = await s<Array<Record<string, unknown>>>`
    SELECT * FROM (
      SELECT o.*, row_number() OVER (PARTITION BY retailer_product_id, zone_id, store_id ORDER BY observed_at DESC) AS rn
      FROM price_observations o WHERE status = 'valid'
    ) t WHERE rn <= 2`;
  const toObs = (r: Record<string, unknown>): PriceObservation => ({
    id: r.id as string,
    retailerProductId: r.retailer_product_id as string,
    zoneId: (r.zone_id as string) ?? null,
    storeId: (r.store_id as string) ?? null,
    priceCents: Number(r.price_cents),
    observedAt: new Date(r.observed_at as string).toISOString(),
    source: { connectorId: r.source_connector as string, kind: r.source_kind as SourceKind, ref: (r.source_ref as string) ?? null },
    isDemo: Boolean(r.is_demo),
  });
  const latestRegular = new Map<string, number>();
  const groups = new Map<string, PriceObservation[]>();
  for (const r of obsRows) {
    const o = toObs(r);
    const key = `${o.retailerProductId}|${o.zoneId}|${o.storeId}`;
    const list = groups.get(key) ?? [];
    list.push(o);
    groups.set(key, list);
  }
  for (const list of groups.values()) {
    list.sort((a, b) => b.observedAt.localeCompare(a.observedAt));
    const [latest, previous] = list;
    if (!latest) continue;
    if (!latest.zoneId && !latest.storeId) latestRegular.set(latest.retailerProductId, latest.priceCents);
    if (latest.isDemo) continue;
    found.push(...checkObservation(latest, now, policy));
    if (previous) {
      const jump = checkPriceJump(previous, latest);
      if (jump) found.push(jump);
    }
  }

  // Promotions actives ou à venir.
  const promoRows = await s<Array<Record<string, unknown>>>`
    SELECT * FROM promotions WHERE status = 'active' AND valid_to >= ${today}`;
  for (const r of promoRows) {
    const p: Promotion = {
      id: r.id as string,
      retailerProductId: r.retailer_product_id as string,
      chainId: r.chain_id as string,
      zoneId: (r.zone_id as string) ?? null,
      storeId: (r.store_id as string) ?? null,
      type: r.type as Promotion['type'],
      promoPriceCents: (r.promo_price_cents as number) ?? null,
      percent: r.percent === null ? null : Number(r.percent),
      buyQty: (r.buy_qty as number) ?? null,
      payQty: (r.pay_qty as number) ?? null,
      minQty: (r.min_qty as number) ?? null,
      whileStocksLast: Boolean(r.while_stocks_last),
      publishedAt: new Date(r.published_at as string).toISOString(),
      validFrom: (r.valid_from instanceof Date ? r.valid_from.toISOString() : String(r.valid_from)).slice(0, 10),
      validTo: (r.valid_to instanceof Date ? r.valid_to.toISOString() : String(r.valid_to)).slice(0, 10),
      source: { connectorId: r.source_connector as string, kind: r.source_kind as SourceKind },
      verifiedAt: new Date(r.verified_at as string).toISOString(),
      isDemo: Boolean(r.is_demo),
    };
    const checks = checkPromotion(p, latestRegular.get(p.retailerProductId) ?? null, chainById.get(p.chainId));
    found.push(...(p.isDemo ? checks.filter((c) => c.severity === 'error') : checks));
  }

  // Prix unitaires aberrants par référence normalisée (données réelles uniquement).
  const unitRows = await s<Array<{ canonical_id: string; rp_id: string; amount: number; unit: string; price_cents: number }>>`
    SELECT m.canonical_id, rp.id AS rp_id, rp.amount, rp.unit, o.price_cents
    FROM product_matches m
    JOIN retailer_products rp ON rp.id = m.retailer_product_id AND NOT rp.is_demo
    JOIN LATERAL (
      SELECT price_cents FROM price_observations
      WHERE retailer_product_id = rp.id AND status = 'valid' AND zone_id IS NULL AND store_id IS NULL
      ORDER BY observed_at DESC LIMIT 1
    ) o ON true
    WHERE m.status = 'validated'`;
  const byCanonical = new Map<string, Array<{ id: string; unitCents: number }>>();
  for (const r of unitRows) {
    const u = unitPrice(Number(r.price_cents), { amount: Number(r.amount), unit: r.unit as Unit });
    const list = byCanonical.get(r.canonical_id) ?? [];
    list.push({ id: r.rp_id, unitCents: u.basis === '100g' || u.basis === '100ml' ? u.cents * 10 : u.cents });
    byCanonical.set(r.canonical_id, list);
  }
  for (const list of byCanonical.values()) {
    for (const item of list) {
      const a = checkUnitPriceOutlier(
        item.id,
        item.unitCents,
        list.filter((x) => x.id !== item.id).map((x) => x.unitCents),
      );
      if (a) found.push(a);
    }
  }

  const recorded = await recordAnomalies(handle, found);
  const byKind: Record<string, number> = {};
  for (const a of found) byKind[a.kind] = (byKind[a.kind] ?? 0) + 1;
  return {
    expiredPromotions: (expired as unknown as { count: number }).count ?? 0,
    anomaliesDetected: found.length,
    anomaliesRecorded: recorded,
    byKind,
  };
}

export async function listAnomalies(handle: DbHandle, opts: { open?: boolean; limit?: number } = {}) {
  const where = opts.open === false ? undefined : isNull(anomalies.resolvedAt);
  return handle.db
    .select()
    .from(anomalies)
    .where(where)
    .orderBy(desc(anomalies.detectedAt))
    .limit(opts.limit ?? 200);
}

/**
 * Résout une anomalie. `rejected_data` écarte la donnée en cause (le prix ou la
 * promotion n'est plus utilisé par le comparateur).
 */
export async function resolveAnomaly(
  handle: DbHandle,
  id: number,
  resolution: 'fixed' | 'ignored' | 'rejected_data',
  actor: string,
): Promise<boolean> {
  return handle.db.transaction(async (tx) => {
    const [row] = await tx.select().from(anomalies).where(and(eq(anomalies.id, id), isNull(anomalies.resolvedAt)));
    if (!row) return false;
    if (resolution === 'rejected_data') {
      if (row.entityType === 'price') await tx.execute(dsql`UPDATE price_observations SET status = 'rejected' WHERE id = ${row.entityId}`);
      if (row.entityType === 'promotion') await tx.execute(dsql`UPDATE promotions SET status = 'rejected', updated_at = now() WHERE id = ${row.entityId}`);
      if (row.entityType === 'retailer_product') await tx.execute(dsql`UPDATE retailer_products SET active = false WHERE id = ${row.entityId}`);
    }
    await tx
      .update(anomalies)
      .set({ resolvedAt: new Date().toISOString(), resolvedBy: actor, resolution })
      .where(eq(anomalies.id, id));
    await tx.insert(auditLog).values({
      actor,
      action: `anomaly.${resolution}`,
      entityType: row.entityType,
      entityId: row.entityId,
      details: { anomalyId: id, kind: row.kind },
    });
    return true;
  });
}

/* ---------------------------------------------------------------- */
/* Correspondances (administration)                                  */
/* ---------------------------------------------------------------- */

export interface MatchRow {
  canonicalId: string;
  canonicalName: string;
  canonicalAmount: number;
  canonicalUnit: string;
  retailerProductId: string;
  retailerName: string;
  chainId: string;
  retailerAmount: number;
  retailerUnit: string;
  brand: string | null;
  kind: string;
  status: string;
  confidence: number;
  origin: string;
  isDemo: boolean;
  reviewedBy: string | null;
  reviewedAt: string | null;
}

export async function listMatches(
  handle: DbHandle,
  opts: { status?: string; chainId?: string; includeDemo?: boolean; limit?: number; q?: string } = {},
): Promise<MatchRow[]> {
  const s = handle.sql;
  const rows = await s<Array<Record<string, unknown>>>`
    SELECT m.canonical_id, c.name AS canonical_name, c.amount AS c_amount, c.unit AS c_unit,
           m.retailer_product_id, rp.name AS rp_name, rp.chain_id, rp.amount AS rp_amount, rp.unit AS rp_unit, rp.brand,
           m.kind, m.status, m.confidence, m.origin, rp.is_demo, m.reviewed_by, m.reviewed_at
    FROM product_matches m
    JOIN canonical_products c ON c.id = m.canonical_id
    JOIN retailer_products rp ON rp.id = m.retailer_product_id
    WHERE (${opts.status ?? null}::text IS NULL OR m.status = ${opts.status ?? null})
      AND (${opts.chainId ?? null}::text IS NULL OR rp.chain_id = ${opts.chainId ?? null})
      AND (${opts.includeDemo ?? false} OR NOT rp.is_demo)
      AND (${opts.q ?? null}::text IS NULL OR c.search_text LIKE ${'%' + (opts.q ?? '') + '%'} OR lower(rp.name) LIKE ${'%' + (opts.q ?? '').toLowerCase() + '%'})
    ORDER BY (m.status = 'suggested') DESC, m.confidence DESC, c.name
    LIMIT ${opts.limit ?? 200}`;
  return rows.map((r) => ({
    canonicalId: r.canonical_id as string,
    canonicalName: r.canonical_name as string,
    canonicalAmount: Number(r.c_amount),
    canonicalUnit: r.c_unit as string,
    retailerProductId: r.retailer_product_id as string,
    retailerName: r.rp_name as string,
    chainId: r.chain_id as string,
    retailerAmount: Number(r.rp_amount),
    retailerUnit: r.rp_unit as string,
    brand: (r.brand as string) ?? null,
    kind: r.kind as string,
    status: r.status as string,
    confidence: Number(r.confidence),
    origin: r.origin as string,
    isDemo: Boolean(r.is_demo),
    reviewedBy: (r.reviewed_by as string) ?? null,
    reviewedAt: r.reviewed_at ? new Date(r.reviewed_at as string).toISOString() : null,
  }));
}

/** Décision humaine sur une correspondance : prioritaire sur tout import ultérieur. */
export async function reviewMatch(
  handle: DbHandle,
  canonicalId: string,
  retailerProductId: string,
  decision: { status: 'validated' | 'rejected'; kind?: 'gtin' | 'equivalent' | 'similar'; note?: string | null },
  actor: string,
): Promise<boolean> {
  return handle.db.transaction(async (tx) => {
    const res = await tx
      .update(productMatches)
      .set({
        status: decision.status,
        ...(decision.kind ? { kind: decision.kind } : {}),
        note: decision.note ?? null,
        origin: 'admin',
        reviewedBy: actor,
        reviewedAt: new Date().toISOString(),
      })
      .where(and(eq(productMatches.canonicalId, canonicalId), eq(productMatches.retailerProductId, retailerProductId)))
      .returning({ c: productMatches.canonicalId });
    if (res.length === 0) return false;
    await tx.insert(auditLog).values({
      actor,
      action: `match.${decision.status}`,
      entityType: 'product_match',
      entityId: `${canonicalId}/${retailerProductId}`,
      details: { kind: decision.kind ?? null, note: decision.note ?? null },
    });
    return true;
  });
}

/* ---------------------------------------------------------------- */
/* État des données par enseigne                                     */
/* ---------------------------------------------------------------- */

export interface ChainDataStatus {
  chainId: string;
  stores: number;
  products: number;
  demoProducts: number;
  lastObservation: string | null;
  activePromotions: number;
  upcomingPromotions: number;
  realPrices: number;
  /** Prix publiés par l'enseigne elle-même (site, API publique, flux sous accord). */
  officialPrices: number;
  lastOfficialObservation: string | null;
}

/**
 * État des données par enseigne. `excludeConnectors` : sources non affichables (usage privé) retirées
 * des comptes et des dates ; l'exclusion vise la source, pas l'enseigne (les relevés Open Prices d'une
 * enseigne restent comptés).
 */
export async function chainDataStatus(handle: DbHandle, now: Date, excludeConnectors: string[] = []): Promise<ChainDataStatus[]> {
  const today = zurichToday(now);
  const s = handle.sql;
  const ex = excludeConnectors;
  const rows = await s<Array<Record<string, unknown>>>`
    SELECT c.id AS chain_id,
      (SELECT count(*)::int FROM stores st WHERE st.chain_id = c.id AND st.active) AS stores,
      (SELECT count(*)::int FROM retailer_products rp WHERE rp.chain_id = c.id AND rp.active AND NOT (rp.connector_id = ANY(${ex}::text[]))) AS products,
      (SELECT count(*)::int FROM retailer_products rp WHERE rp.chain_id = c.id AND rp.active AND rp.is_demo AND NOT (rp.connector_id = ANY(${ex}::text[]))) AS demo_products,
      (SELECT max(o.observed_at) FROM price_observations o JOIN retailer_products rp ON rp.id = o.retailer_product_id
         WHERE rp.chain_id = c.id AND o.status = 'valid' AND NOT (o.source_connector = ANY(${ex}::text[])) AND NOT (rp.connector_id = ANY(${ex}::text[]))) AS last_observation,
      (SELECT count(*)::int FROM price_observations o JOIN retailer_products rp ON rp.id = o.retailer_product_id
         WHERE rp.chain_id = c.id AND o.status = 'valid' AND NOT (o.source_connector = ANY(${ex}::text[])) AND NOT (rp.connector_id = ANY(${ex}::text[])) AND NOT o.is_demo) AS real_prices,
      -- Prix officiels : fiabilité déduite comme reliabilityOf (core) lorsque la colonne est vide.
      (SELECT count(*)::int FROM price_observations o JOIN retailer_products rp ON rp.id = o.retailer_product_id
         WHERE rp.chain_id = c.id AND o.status = 'valid' AND NOT (o.source_connector = ANY(${ex}::text[])) AND NOT (rp.connector_id = ANY(${ex}::text[])) AND NOT o.is_demo AND COALESCE(o.reliability, CASE WHEN o.source_kind IN ('open_data', 'receipt') THEN 'crowd' WHEN o.source_kind = 'third_party' THEN 'third_party' WHEN o.source_kind IN ('manual_survey', 'manual_import') THEN 'survey' ELSE 'official' END) = 'official') AS official_prices,
      (SELECT max(o.observed_at) FROM price_observations o JOIN retailer_products rp ON rp.id = o.retailer_product_id
         WHERE rp.chain_id = c.id AND o.status = 'valid' AND NOT (o.source_connector = ANY(${ex}::text[])) AND NOT (rp.connector_id = ANY(${ex}::text[])) AND NOT o.is_demo AND COALESCE(o.reliability, CASE WHEN o.source_kind IN ('open_data', 'receipt') THEN 'crowd' WHEN o.source_kind = 'third_party' THEN 'third_party' WHEN o.source_kind IN ('manual_survey', 'manual_import') THEN 'survey' ELSE 'official' END) = 'official') AS last_official_observation,
      (SELECT count(*)::int FROM promotions p WHERE p.chain_id = c.id AND p.status = 'active' AND NOT (p.source_connector = ANY(${ex}::text[]))
         AND p.valid_from <= ${today} AND p.valid_to >= ${today} AND p.published_at <= ${now.toISOString()}) AS active_promotions,
      (SELECT count(*)::int FROM promotions p WHERE p.chain_id = c.id AND p.status = 'active' AND NOT (p.source_connector = ANY(${ex}::text[]))
         AND p.valid_from > ${today} AND p.published_at <= ${now.toISOString()}) AS upcoming_promotions
    FROM chains c ORDER BY c.sort`;
  return rows.map((r) => ({
    chainId: r.chain_id as string,
    stores: Number(r.stores),
    products: Number(r.products),
    demoProducts: Number(r.demo_products),
    lastObservation: r.last_observation ? new Date(r.last_observation as string).toISOString() : null,
    activePromotions: Number(r.active_promotions),
    upcomingPromotions: Number(r.upcoming_promotions),
    realPrices: Number(r.real_prices),
    officialPrices: Number(r.official_prices),
    lastOfficialObservation: r.last_official_observation ? new Date(r.last_official_observation as string).toISOString() : null,
  }));
}

/** Statistiques de la dernière collecte réussie (ou partielle) d'un connecteur. */
export async function lastRunStats(handle: DbHandle, connectorId: string): Promise<Record<string, unknown> | null> {
  const rows = await handle.sql<Array<{ stats: Record<string, unknown> }>>`
    SELECT stats FROM import_runs
    WHERE connector_id = ${connectorId} AND status IN ('success', 'partial')
    ORDER BY started_at DESC LIMIT 1`;
  return rows[0]?.stats ?? null;
}

/** Incrémente un compteur quotidien anonyme. */
export async function incrementUsage(handle: DbHandle, day: string, metric: string, dimension: string, n = 1): Promise<void> {
  await handle.sql`
    INSERT INTO usage_daily (day, metric, dimension, count) VALUES (${day}, ${metric}, ${dimension}, ${n})
    ON CONFLICT (day, metric, dimension) DO UPDATE SET count = usage_daily.count + ${n}`;
}

export async function listUsage(handle: DbHandle, fromDay: string): Promise<Array<{ day: string; metric: string; dimension: string; count: number }>> {
  const rows = await handle.sql<Array<{ day: string | Date; metric: string; dimension: string; count: number }>>`
    SELECT day, metric, dimension, count FROM usage_daily WHERE day >= ${fromDay} ORDER BY day`;
  return rows.map((r) => ({
    day: r.day instanceof Date ? r.day.toISOString().slice(0, 10) : String(r.day).slice(0, 10),
    metric: r.metric,
    dimension: r.dimension,
    count: Number(r.count),
  }));
}

/** Inscription à la liste d'attente (idempotente). Renvoie false si l'adresse existait déjà. */
export async function addToWaitlist(handle: DbHandle, email: string, locale: string, canton: string | null, now: Date): Promise<boolean> {
  const rows = await handle.sql`
    INSERT INTO waitlist (email, locale, canton, consent_at) VALUES (${email.toLowerCase()}, ${locale}, ${canton}, ${now.toISOString()})
    ON CONFLICT (email) DO NOTHING RETURNING email`;
  return rows.length > 0;
}
