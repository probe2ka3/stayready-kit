import { sql } from 'drizzle-orm';
import {
  bigserial,
  boolean,
  customType,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  real,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

/** Point géographique PostGIS (WGS 84), calculé à partir de lat/lon. */
const geography = customType<{ data: string }>({
  dataType() {
    return 'geography(Point,4326)';
  },
});

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: 'string' });

/* ---------------------------------------------------------------- */
/* Enseignes et succursales                                          */
/* ---------------------------------------------------------------- */

export const chains = pgTable('chains', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  badge: text('badge').notNull(),
  website: text('website').notNull(),
  status: text('status').notNull().default('active'),
  promoCalendar: jsonb('promo_calendar').notNull(),
  loyaltyPrograms: jsonb('loyalty_programs').notNull().default(sql`'[]'::jsonb`),
  consumerPricesOnly: boolean('consumer_prices_only').notNull().default(false),
  notes: text('notes'),
  sort: integer('sort').notNull().default(0),
  updatedAt: ts('updated_at').notNull().defaultNow(),
});

export const priceZones = pgTable('price_zones', {
  id: text('id').primaryKey(),
  chainId: text('chain_id')
    .notNull()
    .references(() => chains.id),
  name: text('name').notNull(),
  cantons: text('cantons').array().notNull(),
});

export const localities = pgTable(
  'localities',
  {
    id: serial('id').primaryKey(),
    zip: text('zip').notNull(),
    suffix: text('suffix').notNull(),
    name: text('name').notNull(),
    municipality: text('municipality').notNull(),
    canton: text('canton').notNull(),
    lat: doublePrecision('lat').notNull(),
    lon: doublePrecision('lon').notNull(),
    lang: text('lang').notNull().default(''),
    searchText: text('search_text').notNull(),
  },
  (t) => [
    uniqueIndex('localities_zip_suffix_name_uq').on(t.zip, t.suffix, t.name),
    index('localities_zip_idx').on(t.zip),
    index('localities_search_trgm_idx').using('gin', sql`${t.searchText} gin_trgm_ops`),
  ],
);

export const stores = pgTable(
  'stores',
  {
    id: text('id').primaryKey(),
    chainId: text('chain_id')
      .notNull()
      .references(() => chains.id),
    name: text('name').notNull(),
    format: text('format'),
    street: text('street'),
    zip: text('zip'),
    city: text('city'),
    canton: text('canton'),
    lat: doublePrecision('lat').notNull(),
    lon: doublePrecision('lon').notNull(),
    location: geography('location').generatedAlwaysAs(
      sql`(ST_SetSRID(ST_MakePoint(lon, lat), 4326))::geography`,
    ),
    openingHours: text('opening_hours'),
    accessNotes: text('access_notes'),
    zoneId: text('zone_id').references(() => priceZones.id),
    sourceConnector: text('source_connector').notNull(),
    sourceKind: text('source_kind').notNull(),
    sourceRef: text('source_ref'),
    verifiedAt: ts('verified_at'),
    active: boolean('active').notNull().default(true),
    createdAt: ts('created_at').notNull().defaultNow(),
    updatedAt: ts('updated_at').notNull().defaultNow(),
  },
  (t) => [
    index('stores_location_gist').using('gist', t.location),
    index('stores_chain_idx').on(t.chainId),
  ],
);

/* ---------------------------------------------------------------- */
/* Catalogue normalisé                                               */
/* ---------------------------------------------------------------- */

export const categories = pgTable('categories', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  kind: text('kind').notNull(),
  icon: text('icon').notNull(),
  sort: integer('sort').notNull().default(0),
});

export const canonicalProducts = pgTable(
  'canonical_products',
  {
    id: text('id').primaryKey(),
    slug: text('slug').notNull().unique(),
    name: text('name').notNull(),
    categoryId: text('category_id')
      .notNull()
      .references(() => categories.id),
    amount: doublePrecision('amount').notNull(),
    unit: text('unit').notNull(),
    attributes: jsonb('attributes').notNull().default(sql`'{}'::jsonb`),
    brandRequired: text('brand_required'),
    gtins: text('gtins').array().notNull().default(sql`'{}'::text[]`),
    keywords: text('keywords').array().notNull().default(sql`'{}'::text[]`),
    searchText: text('search_text').notNull(),
    active: boolean('active').notNull().default(true),
    updatedAt: ts('updated_at').notNull().defaultNow(),
  },
  (t) => [
    index('canonical_category_idx').on(t.categoryId),
    index('canonical_search_trgm_idx').using('gin', sql`${t.searchText} gin_trgm_ops`),
  ],
);

/* ---------------------------------------------------------------- */
/* Articles des enseignes, correspondances, prix, promotions         */
/* ---------------------------------------------------------------- */

export const retailerProducts = pgTable(
  'retailer_products',
  {
    id: text('id').primaryKey(),
    chainId: text('chain_id')
      .notNull()
      .references(() => chains.id),
    connectorId: text('connector_id').notNull(),
    sku: text('sku').notNull(),
    gtin: text('gtin'),
    name: text('name').notNull(),
    brand: text('brand'),
    amount: doublePrecision('amount').notNull(),
    unit: text('unit').notNull(),
    attributes: jsonb('attributes').notNull().default(sql`'{}'::jsonb`),
    url: text('url'),
    isDemo: boolean('is_demo').notNull().default(false),
    firstSeenAt: ts('first_seen_at').notNull().defaultNow(),
    lastSeenAt: ts('last_seen_at').notNull().defaultNow(),
    active: boolean('active').notNull().default(true),
  },
  (t) => [index('retailer_products_chain_idx').on(t.chainId), index('retailer_products_gtin_idx').on(t.gtin)],
);

export const productMatches = pgTable(
  'product_matches',
  {
    canonicalId: text('canonical_id')
      .notNull()
      .references(() => canonicalProducts.id),
    retailerProductId: text('retailer_product_id')
      .notNull()
      .references(() => retailerProducts.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),
    status: text('status').notNull(),
    confidence: real('confidence').notNull().default(0),
    /** « connector » (proposée par un import) ou « admin » (décision humaine, jamais écrasée). */
    origin: text('origin').notNull().default('connector'),
    note: text('note'),
    reviewedBy: text('reviewed_by'),
    reviewedAt: ts('reviewed_at'),
    createdAt: ts('created_at').notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.canonicalId, t.retailerProductId] }), index('product_matches_status_idx').on(t.status)],
);

export const priceObservations = pgTable(
  'price_observations',
  {
    id: text('id').primaryKey(),
    retailerProductId: text('retailer_product_id')
      .notNull()
      .references(() => retailerProducts.id, { onDelete: 'cascade' }),
    zoneId: text('zone_id'),
    storeId: text('store_id'),
    priceCents: integer('price_cents').notNull(),
    observedAt: ts('observed_at').notNull(),
    sourceConnector: text('source_connector').notNull(),
    sourceKind: text('source_kind').notNull(),
    sourceRef: text('source_ref'),
    importRunId: integer('import_run_id'),
    isDemo: boolean('is_demo').notNull().default(false),
    status: text('status').notNull().default('valid'),
    /** regular | promo */
    priceType: text('price_type').notNull().default('regular'),
    /** store | online */
    channel: text('channel').notNull().default('store'),
    /** official | survey | crowd ; null = déduite du type de source */
    reliability: text('reliability'),
    /** Licence des données (ex. ODbL-1.0) ; null = données propres ou sous accord */
    license: text('license'),
    sourceUrl: text('source_url'),
    observedAtPlace: text('observed_at_place'),
    /** receipt | price_tag | web_page */
    proof: text('proof'),
    createdAt: ts('created_at').notNull().defaultNow(),
  },
  (t) => [
    index('price_obs_product_time_idx').on(t.retailerProductId, t.observedAt),
    index('price_obs_connector_time_idx').on(t.sourceConnector, t.observedAt),
  ],
);

export const promotions = pgTable(
  'promotions',
  {
    id: text('id').primaryKey(),
    retailerProductId: text('retailer_product_id')
      .notNull()
      .references(() => retailerProducts.id, { onDelete: 'cascade' }),
    chainId: text('chain_id')
      .notNull()
      .references(() => chains.id),
    zoneId: text('zone_id'),
    storeId: text('store_id'),
    type: text('type').notNull(),
    promoPriceCents: integer('promo_price_cents'),
    percent: real('percent'),
    buyQty: integer('buy_qty'),
    payQty: integer('pay_qty'),
    minQty: integer('min_qty'),
    referencePriceCents: integer('reference_price_cents'),
    loyaltyProgram: text('loyalty_program'),
    whileStocksLast: boolean('while_stocks_last').notNull().default(false),
    endIsPresumed: boolean('end_is_presumed').notNull().default(false),
    label: text('label'),
    regionNote: text('region_note'),
    sourceUrl: text('source_url'),
    publishedAt: ts('published_at').notNull(),
    validFrom: date('valid_from', { mode: 'string' }).notNull(),
    validTo: date('valid_to', { mode: 'string' }).notNull(),
    sourceConnector: text('source_connector').notNull(),
    sourceKind: text('source_kind').notNull(),
    sourceRef: text('source_ref'),
    verifiedAt: ts('verified_at').notNull(),
    importRunId: integer('import_run_id'),
    isDemo: boolean('is_demo').notNull().default(false),
    status: text('status').notNull().default('active'),
    createdAt: ts('created_at').notNull().defaultNow(),
    updatedAt: ts('updated_at').notNull().defaultNow(),
  },
  (t) => [
    index('promotions_product_idx').on(t.retailerProductId),
    index('promotions_validity_idx').on(t.validFrom, t.validTo),
  ],
);

/* ---------------------------------------------------------------- */
/* Journalisation, qualité, audit                                    */
/* ---------------------------------------------------------------- */

export const importRuns = pgTable(
  'import_runs',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    connectorId: text('connector_id').notNull(),
    kind: text('kind').notNull(),
    startedAt: ts('started_at').notNull().defaultNow(),
    finishedAt: ts('finished_at'),
    status: text('status').notNull().default('running'),
    triggeredBy: text('triggered_by').notNull().default('system'),
    stats: jsonb('stats').notNull().default(sql`'{}'::jsonb`),
    issues: jsonb('issues').notNull().default(sql`'[]'::jsonb`),
    message: text('message'),
  },
  (t) => [index('import_runs_started_idx').on(t.startedAt)],
);

export const anomalies = pgTable(
  'anomalies',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    kind: text('kind').notNull(),
    severity: text('severity').notNull(),
    entityType: text('entity_type').notNull(),
    entityId: text('entity_id').notNull(),
    message: text('message').notNull(),
    details: jsonb('details').notNull().default(sql`'{}'::jsonb`),
    detectedAt: ts('detected_at').notNull().defaultNow(),
    resolvedAt: ts('resolved_at'),
    resolvedBy: text('resolved_by'),
    resolution: text('resolution'),
  },
  (t) => [
    uniqueIndex('anomalies_open_uq')
      .on(t.kind, t.entityType, t.entityId)
      .where(sql`resolved_at IS NULL`),
    index('anomalies_detected_idx').on(t.detectedAt),
  ],
);

export const auditLog = pgTable('audit_log', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  at: ts('at').notNull().defaultNow(),
  actor: text('actor').notNull(),
  action: text('action').notNull(),
  entityType: text('entity_type'),
  entityId: text('entity_id'),
  details: jsonb('details').notNull().default(sql`'{}'::jsonb`),
});
