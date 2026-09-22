CREATE TABLE IF NOT EXISTS "product_registrations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"farm_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"active_ingredient" text NOT NULL,
	"default_reason" text,
	"l_number" text,
	"withholding_period" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_registrations_item_id_unique" UNIQUE("item_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "spray_applications" (
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
	"item_id" uuid NOT NULL,
	"quantity" double precision NOT NULL,
	"concentration" text,
	"reason" text,
	"method" text,
	"water_point_id" uuid,
	"meter_reading" double precision,
	"latitude" double precision,
	"longitude" double precision,
	"location_accuracy_m" double precision,
	"weather_temp" double precision,
	"weather_humidity" double precision,
	"weather_condition" text
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "product_registrations" ADD CONSTRAINT "product_registrations_farm_id_farms_id_fk" FOREIGN KEY ("farm_id") REFERENCES "public"."farms"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "product_registrations" ADD CONSTRAINT "product_registrations_item_id_stock_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."stock_items"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "spray_applications" ADD CONSTRAINT "spray_applications_block_id_blocks_id_fk" FOREIGN KEY ("block_id") REFERENCES "public"."blocks"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "spray_applications" ADD CONSTRAINT "spray_applications_item_id_stock_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."stock_items"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "spray_applications" ADD CONSTRAINT "spray_applications_water_point_id_water_points_id_fk" FOREIGN KEY ("water_point_id") REFERENCES "public"."water_points"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
