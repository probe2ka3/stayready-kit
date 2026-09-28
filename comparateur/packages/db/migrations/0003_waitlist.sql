CREATE TABLE "waitlist" (
	"email" text PRIMARY KEY NOT NULL,
	"locale" text DEFAULT 'fr' NOT NULL,
	"canton" text,
	"consent_at" timestamp with time zone NOT NULL,
	"confirmed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
