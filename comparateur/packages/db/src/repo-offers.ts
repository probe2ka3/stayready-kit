import {
  addDays,
  buildOfferIndex,
  MAX_PLAN_DAYS,
  zurichToday,
  type OfferIndex,
  type PriceObservation,
  type ProductMatch,
  type Promotion,
  type RetailerProduct,
  type SourceKind,
  type Unit,
} from '@cabas/core';
import { inArray, sql as dsql } from 'drizzle-orm';
import { chunk, type DbHandle } from './client';
import { canonicalProducts, priceObservations, productMatches, promotions, retailerProducts } from './schema';

export interface BatchInput {
  connectorId: string;
  retailerProducts: RetailerProduct[];
  matches: ProductMatch[];
  prices: PriceObservation[];
  promotions: Promotion[];
}

export interface ApplyResult {
  products: number;
  matches: number;
  prices: number;
  promotions: number;
  rejected: Array<{ message: string; entityId: string }>;
}

/**
 * Enregistre un lot de connecteur dans une transaction.
 * - Les décisions humaines sur les correspondances (origin = admin) ne sont jamais écrasées.
 * - Une promotion ou un prix portant sur un article inconnu est rejeté et journalisé.
 */
export async function applyBatch(handle: DbHandle, batch: BatchInput, importRunId: number | null): Promise<ApplyResult> {
  const rejected: ApplyResult['rejected'] = [];
  let matchesWritten = 0;
  await handle.db.transaction(async (tx) => {
    for (const part of chunk(batch.retailerProducts, 400)) {
      await tx
        .insert(retailerProducts)
        .values(
          part.map((p) => ({
            id: p.id,
            chainId: p.chainId,
            connectorId: p.connectorId,
            sku: p.sku,
            gtin: p.gtin ?? null,
            name: p.name,
            brand: p.brand ?? null,
            amount: p.quantity.amount,
            unit: p.quantity.unit,
            attributes: p.attributes,
            url: p.url ?? null,
            isDemo: p.isDemo,
          })),
        )
        .onConflictDoUpdate({
          target: retailerProducts.id,
          set: {
            name: dsql`excluded.name`,
            brand: dsql`excluded.brand`,
            gtin: dsql`excluded.gtin`,
            amount: dsql`excluded.amount`,
            unit: dsql`excluded.unit`,
            attributes: dsql`excluded.attributes`,
            url: dsql`excluded.url`,
            isDemo: dsql`excluded.is_demo`,
            lastSeenAt: dsql`now()`,
            active: dsql`true`,
          },
        });
    }

    // Articles connus (lot + base) et références existantes.
    const productIds = new Set(batch.retailerProducts.map((p) => p.id));
    const referenced = [
      ...new Set([...batch.prices.map((p) => p.retailerProductId), ...batch.promotions.map((p) => p.retailerProductId)]),
    ].filter((id) => !productIds.has(id));
    if (referenced.length) {
      for (const part of chunk(referenced, 1000)) {
        const rows = await tx.select({ id: retailerProducts.id }).from(retailerProducts).where(inArray(retailerProducts.id, part));
        for (const r of rows) productIds.add(r.id);
      }
    }
    const canonicalRows = await tx.select({ id: canonicalProducts.id }).from(canonicalProducts);
    const canonicalIds = new Set(canonicalRows.map((r) => r.id));

    const validMatches = batch.matches.filter((m) => {
      if (!canonicalIds.has(m.canonicalId)) {
        rejected.push({ entityId: `${m.canonicalId}/${m.retailerProductId}`, message: 'Référence normalisée inconnue' });
        return false;
      }
      return productIds.has(m.retailerProductId);
    });
    for (const part of chunk(validMatches, 500)) {
      await tx
        .insert(productMatches)
        .values(
          part.map((m) => ({
            canonicalId: m.canonicalId,
            retailerProductId: m.retailerProductId,
            kind: m.kind,
            status: m.status,
            confidence: m.confidence,
            origin: 'connector',
          })),
        )
        .onConflictDoUpdate({
          target: [productMatches.canonicalId, productMatches.retailerProductId],
          set: {
            kind: dsql`CASE WHEN product_matches.origin = 'admin' THEN product_matches.kind ELSE excluded.kind END`,
            status: dsql`CASE WHEN product_matches.origin = 'admin' THEN product_matches.status ELSE excluded.status END`,
            confidence: dsql`excluded.confidence`,
          },
        });
      matchesWritten += part.length;
    }

    const prices = batch.prices.filter((p) => {
      if (productIds.has(p.retailerProductId)) return true;
      rejected.push({ entityId: p.id, message: `Prix pour un article inconnu : ${p.retailerProductId}` });
      return false;
    });
    for (const part of chunk(prices, 500)) {
      await tx
        .insert(priceObservations)
        .values(
          part.map((p) => ({
            id: p.id,
            retailerProductId: p.retailerProductId,
            zoneId: p.zoneId,
            storeId: p.storeId,
            priceCents: p.priceCents,
            observedAt: p.observedAt,
            sourceConnector: p.source.connectorId,
            sourceKind: p.source.kind,
            sourceRef: p.source.ref ?? null,
            importRunId,
            isDemo: p.isDemo,
            priceType: p.priceType ?? 'regular',
            channel: p.channel ?? 'store',
            reliability: p.reliability ?? null,
            license: p.license ?? null,
            sourceUrl: p.sourceUrl ?? null,
            observedAtPlace: p.observedAtPlace ?? null,
            proof: p.proof ?? null,
          })),
        )
        .onConflictDoUpdate({
          target: priceObservations.id,
          set: {
            priceCents: dsql`excluded.price_cents`,
            observedAt: dsql`excluded.observed_at`,
            sourceKind: dsql`excluded.source_kind`,
            sourceRef: dsql`excluded.source_ref`,
            importRunId: dsql`excluded.import_run_id`,
            isDemo: dsql`excluded.is_demo`,
            priceType: dsql`excluded.price_type`,
            channel: dsql`excluded.channel`,
            reliability: dsql`excluded.reliability`,
            license: dsql`excluded.license`,
            sourceUrl: dsql`excluded.source_url`,
            observedAtPlace: dsql`excluded.observed_at_place`,
            proof: dsql`excluded.proof`,
            status: dsql`'valid'`,
          },
        });
    }

    const promos = batch.promotions.filter((p) => {
      if (productIds.has(p.retailerProductId)) return true;
      rejected.push({ entityId: p.id, message: `Promotion pour un article inconnu : ${p.retailerProductId}` });
      return false;
    });
    for (const part of chunk(promos, 300)) {
      await tx
        .insert(promotions)
        .values(
          part.map((p) => ({
            id: p.id,
            retailerProductId: p.retailerProductId,
            chainId: p.chainId,
            zoneId: p.zoneId,
            storeId: p.storeId,
            type: p.type,
            promoPriceCents: p.promoPriceCents ?? null,
            percent: p.percent ?? null,
            buyQty: p.buyQty ?? null,
            payQty: p.payQty ?? null,
            minQty: p.minQty ?? null,
            referencePriceCents: p.referencePriceCents ?? null,
            loyaltyProgram: p.loyaltyProgram ?? null,
            whileStocksLast: p.whileStocksLast,
            endIsPresumed: Boolean(p.endIsPresumed),
            label: p.label ?? null,
            regionNote: p.regionNote ?? null,
            sourceUrl: p.sourceUrl ?? null,
            publishedAt: p.publishedAt,
            validFrom: p.validFrom,
            validTo: p.validTo,
            sourceConnector: p.source.connectorId,
            sourceKind: p.source.kind,
            sourceRef: p.source.ref ?? null,
            verifiedAt: p.verifiedAt,
            importRunId,
            isDemo: p.isDemo,
          })),
        )
        .onConflictDoUpdate({
          target: promotions.id,
          set: {
            type: dsql`excluded.type`,
            promoPriceCents: dsql`excluded.promo_price_cents`,
            percent: dsql`excluded.percent`,
            buyQty: dsql`excluded.buy_qty`,
            payQty: dsql`excluded.pay_qty`,
            minQty: dsql`excluded.min_qty`,
            referencePriceCents: dsql`excluded.reference_price_cents`,
            loyaltyProgram: dsql`excluded.loyalty_program`,
            whileStocksLast: dsql`excluded.while_stocks_last`,
            endIsPresumed: dsql`excluded.end_is_presumed`,
            label: dsql`excluded.label`,
            regionNote: dsql`excluded.region_note`,
            sourceUrl: dsql`excluded.source_url`,
            publishedAt: dsql`LEAST(promotions.published_at, excluded.published_at)`,
            validFrom: dsql`excluded.valid_from`,
            validTo: dsql`excluded.valid_to`,
            sourceKind: dsql`excluded.source_kind`,
            sourceRef: dsql`excluded.source_ref`,
            verifiedAt: dsql`excluded.verified_at`,
            importRunId: dsql`excluded.import_run_id`,
            updatedAt: dsql`now()`,
          },
        });
    }
    batch.prices = prices;
    batch.promotions = promos;
  });
  return {
    products: batch.retailerProducts.length,
    matches: matchesWritten,
    prices: batch.prices.length,
    promotions: batch.promotions.length,
    rejected,
  };
}

/**
 * Charge les données tarifaires utiles à une comparaison : correspondances validées,
 * articles, dernière observation par portée et promotions publiées couvrant
 * l'horizon de planification.
 */
export async function loadOfferIndex(
  handle: DbHandle,
  canonicalIds: string[],
  chainIds: string[],
  now: Date,
  /** « live » : données réelles uniquement ; « demo » : données fictives uniquement. */
  mode: 'live' | 'demo' = 'live',
): Promise<OfferIndex> {
  if (canonicalIds.length === 0 || chainIds.length === 0) {
    return buildOfferIndex({ products: [], matches: [], prices: [], promotions: [] });
  }
  const s = handle.sql;
  const nowIso = now.toISOString();
  const today = zurichToday(now);

  const matchRows = await s<Array<{ canonical_id: string; retailer_product_id: string; kind: string; confidence: number }>>`
    SELECT m.canonical_id, m.retailer_product_id, m.kind, m.confidence
    FROM product_matches m JOIN retailer_products rp ON rp.id = m.retailer_product_id
    WHERE m.status = 'validated' AND rp.active AND rp.is_demo = ${mode === 'demo'}
      AND m.canonical_id = ANY(${canonicalIds}) AND rp.chain_id = ANY(${chainIds})`;
  const rpIds = [...new Set(matchRows.map((m) => m.retailer_product_id))];
  if (rpIds.length === 0) return buildOfferIndex({ products: [], matches: [], prices: [], promotions: [] });

  const [productRows, priceRows, promoRows] = await Promise.all([
    s<Array<Record<string, unknown>>>`
      SELECT id, chain_id, connector_id, sku, gtin, name, brand, amount, unit, attributes, url, is_demo
      FROM retailer_products WHERE id = ANY(${rpIds})`,
    s<Array<Record<string, unknown>>>`
      SELECT DISTINCT ON (retailer_product_id, zone_id, store_id)
             id, retailer_product_id, zone_id, store_id, price_cents, observed_at,
             source_connector, source_kind, source_ref, is_demo, price_type, channel,
             reliability, license, source_url, observed_at_place, proof
      FROM price_observations
      WHERE retailer_product_id = ANY(${rpIds}) AND status = 'valid' AND observed_at <= ${nowIso}
        AND is_demo = ${mode === 'demo'} AND price_type = 'regular'
      ORDER BY retailer_product_id, zone_id, store_id, observed_at DESC`,
    s<Array<Record<string, unknown>>>`
      SELECT * FROM promotions
      WHERE retailer_product_id = ANY(${rpIds})
        AND is_demo = ${mode === 'demo'}
        AND status NOT IN ('withdrawn', 'rejected')
        AND published_at <= ${nowIso}
        AND valid_to >= ${addDays(today, -1)}
        AND valid_from <= ${addDays(today, MAX_PLAN_DAYS + 1)}`,
  ]);

  const products: RetailerProduct[] = productRows.map((r) => ({
    id: r.id as string,
    chainId: r.chain_id as string,
    connectorId: r.connector_id as string,
    sku: r.sku as string,
    gtin: (r.gtin as string) ?? null,
    name: r.name as string,
    brand: (r.brand as string) ?? null,
    quantity: { amount: Number(r.amount), unit: r.unit as Unit },
    attributes: (r.attributes as RetailerProduct['attributes']) ?? {},
    url: (r.url as string) ?? null,
    isDemo: Boolean(r.is_demo),
  }));
  const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : new Date(String(v)).toISOString());
  const prices: PriceObservation[] = priceRows.map((r) => ({
    id: r.id as string,
    retailerProductId: r.retailer_product_id as string,
    zoneId: (r.zone_id as string) ?? null,
    storeId: (r.store_id as string) ?? null,
    priceCents: Number(r.price_cents),
    observedAt: iso(r.observed_at),
    source: { connectorId: r.source_connector as string, kind: r.source_kind as SourceKind, ref: (r.source_ref as string) ?? null },
    isDemo: Boolean(r.is_demo),
    priceType: (r.price_type as PriceObservation['priceType']) ?? 'regular',
    channel: (r.channel as PriceObservation['channel']) ?? 'store',
    reliability: (r.reliability as PriceObservation['reliability']) ?? undefined,
    license: (r.license as string) ?? null,
    sourceUrl: (r.source_url as string) ?? null,
    observedAtPlace: (r.observed_at_place as string) ?? null,
    proof: (r.proof as PriceObservation['proof']) ?? null,
  }));
  const dateStr = (v: unknown) => (v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10));
  const promos: Promotion[] = promoRows.map((r) => ({
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
    referencePriceCents: (r.reference_price_cents as number) ?? null,
    loyaltyProgram: (r.loyalty_program as string) ?? null,
    whileStocksLast: Boolean(r.while_stocks_last),
    endIsPresumed: Boolean(r.end_is_presumed),
    label: (r.label as string) ?? null,
    regionNote: (r.region_note as string) ?? null,
    sourceUrl: (r.source_url as string) ?? null,
    publishedAt: iso(r.published_at),
    validFrom: dateStr(r.valid_from),
    validTo: dateStr(r.valid_to),
    source: { connectorId: r.source_connector as string, kind: r.source_kind as SourceKind, ref: (r.source_ref as string) ?? null },
    verifiedAt: iso(r.verified_at),
    isDemo: Boolean(r.is_demo),
  }));
  const matches: ProductMatch[] = matchRows.map((m) => ({
    canonicalId: m.canonical_id,
    retailerProductId: m.retailer_product_id,
    kind: m.kind as ProductMatch['kind'],
    status: 'validated',
    confidence: Number(m.confidence),
  }));
  return buildOfferIndex({ products, matches, prices, promotions: promos });
}

/**
 * Supprime toutes les données de démonstration (articles fictifs et, en cascade,
 * leurs prix, promotions et correspondances). À exécuter avant l'ouverture
 * publique avec des prix réels.
 */
export async function purgeDemoData(handle: DbHandle): Promise<number> {
  const rows = await handle.sql`DELETE FROM retailer_products WHERE is_demo RETURNING id`;
  await handle.sql`DELETE FROM price_observations WHERE is_demo`;
  await handle.sql`DELETE FROM promotions WHERE is_demo`;
  return rows.length;
}

/** Supprime toutes les données d'une source (demande d'une enseigne, retrait de licence). */
export async function purgeSource(handle: DbHandle, connectorId: string): Promise<{ products: number }> {
  return handle.db.transaction(async (tx) => {
    await tx.execute(dsql`DELETE FROM price_observations WHERE source_connector = ${connectorId}`);
    await tx.execute(dsql`DELETE FROM promotions WHERE source_connector = ${connectorId}`);
    const res = await tx.execute(dsql`DELETE FROM retailer_products WHERE connector_id = ${connectorId}`);
    return { products: Number((res as unknown as { count?: number }).count ?? 0) };
  });
}
