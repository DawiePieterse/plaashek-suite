CREATE TYPE "public"."person_kind" AS ENUM('staff', 'seasonal');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "piece_rates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"farm_id" uuid NOT NULL,
	"season_id" uuid NOT NULL,
	"effective_from" date NOT NULL,
	"base_cents_per_kg" integer NOT NULL,
	"target_kg" double precision,
	"bonus_cents_per_kg" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "worker_cards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"farm_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"code" text NOT NULL,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"issued_by" uuid NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "worker_cards_farm_id_code_unique" UNIQUE("farm_id","code")
);
--> statement-breakpoint
ALTER TABLE "harvest_events" ADD COLUMN "picker_id" uuid;--> statement-breakpoint
ALTER TABLE "harvest_events" ADD COLUMN "picker_card_code" text;--> statement-breakpoint
ALTER TABLE "people" ADD COLUMN "kind" "person_kind" DEFAULT 'staff' NOT NULL;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "piece_rates" ADD CONSTRAINT "piece_rates_farm_id_farms_id_fk" FOREIGN KEY ("farm_id") REFERENCES "public"."farms"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "piece_rates" ADD CONSTRAINT "piece_rates_season_id_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "worker_cards" ADD CONSTRAINT "worker_cards_farm_id_farms_id_fk" FOREIGN KEY ("farm_id") REFERENCES "public"."farms"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "worker_cards" ADD CONSTRAINT "worker_cards_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "worker_cards" ADD CONSTRAINT "worker_cards_issued_by_farm_memberships_id_fk" FOREIGN KEY ("issued_by") REFERENCES "public"."farm_memberships"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "harvest_events" ADD CONSTRAINT "harvest_events_picker_id_people_id_fk" FOREIGN KEY ("picker_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
