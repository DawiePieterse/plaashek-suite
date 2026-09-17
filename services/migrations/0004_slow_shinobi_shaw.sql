ALTER TABLE "notes" ADD COLUMN "block_id" uuid;--> statement-breakpoint
ALTER TABLE "notes" ADD COLUMN "latitude" double precision;--> statement-breakpoint
ALTER TABLE "notes" ADD COLUMN "longitude" double precision;--> statement-breakpoint
ALTER TABLE "notes" ADD COLUMN "location_accuracy_m" double precision;--> statement-breakpoint
ALTER TABLE "notes" ADD COLUMN "weather_temp" double precision;--> statement-breakpoint
ALTER TABLE "notes" ADD COLUMN "weather_humidity" double precision;--> statement-breakpoint
ALTER TABLE "notes" ADD COLUMN "weather_condition" text;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "notes" ADD CONSTRAINT "notes_block_id_blocks_id_fk" FOREIGN KEY ("block_id") REFERENCES "public"."blocks"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
