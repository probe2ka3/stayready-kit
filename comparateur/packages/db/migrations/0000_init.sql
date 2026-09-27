-- Extensions requises : PostGIS (recherche géographique) et pg_trgm (recherche floue).
CREATE EXTENSION IF NOT EXISTS postgis;--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint
CREATE TABLE "anomalies" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"severity" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"message" text NOT NULL,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"detected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	"resolved_by" text,
	"resolution" text
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor" text NOT NULL,
	"action" text NOT NULL,
	"entity_type" text,
	"entity_id" text,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "canonical_products" (
	"id" text PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"category_id" text NOT NULL,
	"amount" double precision NOT NULL,
	"unit" text NOT NULL,
	"attributes" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"brand_required" text,
	"gtins" text[] DEFAULT '{}'::text[] NOT NULL,
	"keywords" text[] DEFAULT '{}'::text[] NOT NULL,
	"search_text" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "canonical_products_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"icon" text NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chains" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"badge" text NOT NULL,
	"website" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"promo_calendar" jsonb NOT NULL,
	"loyalty_programs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"consumer_prices_only" boolean DEFAULT false NOT NULL,
	"notes" text,
	"sort" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "import_runs" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"connector_id" text NOT NULL,
	"kind" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"status" text DEFAULT 'running' NOT NULL,
	"triggered_by" text DEFAULT 'system' NOT NULL,
	"stats" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"issues" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"message" text
);
--> statement-breakpoint
CREATE TABLE "localities" (
	"id" serial PRIMARY KEY NOT NULL,
	"zip" text NOT NULL,
	"suffix" text NOT NULL,
	"name" text NOT NULL,
	"municipality" text NOT NULL,
	"canton" text NOT NULL,
	"lat" double precision NOT NULL,
	"lon" double precision NOT NULL,
	"lang" text DEFAULT '' NOT NULL,
	"search_text" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "price_observations" (
	"id" text PRIMARY KEY NOT NULL,
	"retailer_product_id" text NOT NULL,
	"zone_id" text,
	"store_id" text,
	"price_cents" integer NOT NULL,
	"observed_at" timestamp with time zone NOT NULL,
	"source_connector" text NOT NULL,
	"source_kind" text NOT NULL,
	"source_ref" text,
	"import_run_id" integer,
	"is_demo" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'valid' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "price_zones" (
	"id" text PRIMARY KEY NOT NULL,
	"chain_id" text NOT NULL,
	"name" text NOT NULL,
	"cantons" text[] NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_matches" (
	"canonical_id" text NOT NULL,
	"retailer_product_id" text NOT NULL,
	"kind" text NOT NULL,
	"status" text NOT NULL,
	"confidence" real DEFAULT 0 NOT NULL,
	"origin" text DEFAULT 'connector' NOT NULL,
	"note" text,
	"reviewed_by" text,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_matches_canonical_id_retailer_product_id_pk" PRIMARY KEY("canonical_id","retailer_product_id")
);
--> statement-breakpoint
CREATE TABLE "promotions" (
	"id" text PRIMARY KEY NOT NULL,
	"retailer_product_id" text NOT NULL,
	"chain_id" text NOT NULL,
	"zone_id" text,
	"store_id" text,
	"type" text NOT NULL,
	"promo_price_cents" integer,
	"percent" real,
	"buy_qty" integer,
	"pay_qty" integer,
	"min_qty" integer,
	"reference_price_cents" integer,
	"loyalty_program" text,
	"while_stocks_last" boolean DEFAULT false NOT NULL,
	"end_is_presumed" boolean DEFAULT false NOT NULL,
	"label" text,
	"published_at" timestamp with time zone NOT NULL,
	"valid_from" date NOT NULL,
	"valid_to" date NOT NULL,
	"source_connector" text NOT NULL,
	"source_kind" text NOT NULL,
	"source_ref" text,
	"verified_at" timestamp with time zone NOT NULL,
	"import_run_id" integer,
	"is_demo" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "retailer_products" (
	"id" text PRIMARY KEY NOT NULL,
	"chain_id" text NOT NULL,
	"connector_id" text NOT NULL,
	"sku" text NOT NULL,
	"gtin" text,
	"name" text NOT NULL,
	"brand" text,
	"amount" double precision NOT NULL,
	"unit" text NOT NULL,
	"attributes" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"url" text,
	"is_demo" boolean DEFAULT false NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stores" (
	"id" text PRIMARY KEY NOT NULL,
	"chain_id" text NOT NULL,
	"name" text NOT NULL,
	"format" text,
	"street" text,
	"zip" text,
	"city" text,
	"canton" text,
	"lat" double precision NOT NULL,
	"lon" double precision NOT NULL,
	"location" geography(Point,4326) GENERATED ALWAYS AS ((ST_SetSRID(ST_MakePoint(lon, lat), 4326))::geography) STORED,
	"opening_hours" text,
	"access_notes" text,
	"zone_id" text,
	"source_connector" text NOT NULL,
	"source_kind" text NOT NULL,
	"source_ref" text,
	"verified_at" timestamp with time zone,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "canonical_products" ADD CONSTRAINT "canonical_products_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_observations" ADD CONSTRAINT "price_observations_retailer_product_id_retailer_products_id_fk" FOREIGN KEY ("retailer_product_id") REFERENCES "public"."retailer_products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_zones" ADD CONSTRAINT "price_zones_chain_id_chains_id_fk" FOREIGN KEY ("chain_id") REFERENCES "public"."chains"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_matches" ADD CONSTRAINT "product_matches_canonical_id_canonical_products_id_fk" FOREIGN KEY ("canonical_id") REFERENCES "public"."canonical_products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_matches" ADD CONSTRAINT "product_matches_retailer_product_id_retailer_products_id_fk" FOREIGN KEY ("retailer_product_id") REFERENCES "public"."retailer_products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promotions" ADD CONSTRAINT "promotions_retailer_product_id_retailer_products_id_fk" FOREIGN KEY ("retailer_product_id") REFERENCES "public"."retailer_products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promotions" ADD CONSTRAINT "promotions_chain_id_chains_id_fk" FOREIGN KEY ("chain_id") REFERENCES "public"."chains"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "retailer_products" ADD CONSTRAINT "retailer_products_chain_id_chains_id_fk" FOREIGN KEY ("chain_id") REFERENCES "public"."chains"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stores" ADD CONSTRAINT "stores_chain_id_chains_id_fk" FOREIGN KEY ("chain_id") REFERENCES "public"."chains"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stores" ADD CONSTRAINT "stores_zone_id_price_zones_id_fk" FOREIGN KEY ("zone_id") REFERENCES "public"."price_zones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "anomalies_open_uq" ON "anomalies" USING btree ("kind","entity_type","entity_id") WHERE resolved_at IS NULL;--> statement-breakpoint
CREATE INDEX "anomalies_detected_idx" ON "anomalies" USING btree ("detected_at");--> statement-breakpoint
CREATE INDEX "canonical_category_idx" ON "canonical_products" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "canonical_search_trgm_idx" ON "canonical_products" USING gin ("search_text" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "import_runs_started_idx" ON "import_runs" USING btree ("started_at");--> statement-breakpoint
CREATE UNIQUE INDEX "localities_zip_suffix_name_uq" ON "localities" USING btree ("zip","suffix","name");--> statement-breakpoint
CREATE INDEX "localities_zip_idx" ON "localities" USING btree ("zip");--> statement-breakpoint
CREATE INDEX "localities_search_trgm_idx" ON "localities" USING gin ("search_text" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "price_obs_product_time_idx" ON "price_observations" USING btree ("retailer_product_id","observed_at");--> statement-breakpoint
CREATE INDEX "product_matches_status_idx" ON "product_matches" USING btree ("status");--> statement-breakpoint
CREATE INDEX "promotions_product_idx" ON "promotions" USING btree ("retailer_product_id");--> statement-breakpoint
CREATE INDEX "promotions_validity_idx" ON "promotions" USING btree ("valid_from","valid_to");--> statement-breakpoint
CREATE INDEX "retailer_products_chain_idx" ON "retailer_products" USING btree ("chain_id");--> statement-breakpoint
CREATE INDEX "retailer_products_gtin_idx" ON "retailer_products" USING btree ("gtin");--> statement-breakpoint
CREATE INDEX "stores_location_gist" ON "stores" USING gist ("location");--> statement-breakpoint
CREATE INDEX "stores_chain_idx" ON "stores" USING btree ("chain_id");