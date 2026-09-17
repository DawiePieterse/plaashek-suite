CREATE TABLE IF NOT EXISTS "harvest_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"farm_id" uuid NOT NULL,
	"module_code" text NOT NULL,
	"season_id" uuid,
	"created_by" uuid NOT NULL,
	"device_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	"rev" integer DEFAULT 1 NOT NULL,
	"block_id" uuid NOT NULL,
	"weight_kg" double precision NOT NULL,
	"deduction_kg" double precision,
	"weather_temp" double precision,
	"weather_humidity" double precision,
	"weather_condition" text
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "harvest_events" ADD CONSTRAINT "harvest_events_block_id_blocks_id_fk" FOREIGN KEY ("block_id") REFERENCES "public"."blocks"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
