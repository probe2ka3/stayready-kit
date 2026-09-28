CREATE TABLE "usage_daily" (
	"day" date NOT NULL,
	"metric" text NOT NULL,
	"dimension" text NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "usage_daily_day_metric_dimension_pk" PRIMARY KEY("day","metric","dimension")
);
