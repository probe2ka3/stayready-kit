ALTER TABLE "price_observations" ADD COLUMN "price_type" text DEFAULT 'regular' NOT NULL;--> statement-breakpoint
ALTER TABLE "price_observations" ADD COLUMN "channel" text DEFAULT 'store' NOT NULL;--> statement-breakpoint
ALTER TABLE "price_observations" ADD COLUMN "reliability" text;--> statement-breakpoint
ALTER TABLE "price_observations" ADD COLUMN "license" text;--> statement-breakpoint
ALTER TABLE "price_observations" ADD COLUMN "source_url" text;--> statement-breakpoint
ALTER TABLE "price_observations" ADD COLUMN "observed_at_place" text;--> statement-breakpoint
ALTER TABLE "price_observations" ADD COLUMN "proof" text;--> statement-breakpoint
ALTER TABLE "promotions" ADD COLUMN "region_note" text;--> statement-breakpoint
ALTER TABLE "promotions" ADD COLUMN "source_url" text;--> statement-breakpoint
CREATE INDEX "price_obs_connector_time_idx" ON "price_observations" USING btree ("source_connector","observed_at");