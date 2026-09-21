CREATE TABLE IF NOT EXISTS "animals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"farm_id" uuid NOT NULL,
	"tag_number" text,
	"sex" text NOT NULL,
	"breed" text,
	"birth_date" date,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "movements" (
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
	"animal_id" uuid NOT NULL,
	"to_camp_id" uuid NOT NULL,
	"from_camp_id" uuid
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "treatments" (
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
	"animal_id" uuid NOT NULL,
	"treatment_type" text NOT NULL,
	"dose" text,
	"note" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "weights" (
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
	"animal_id" uuid NOT NULL,
	"weight_kg" double precision NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "animals" ADD CONSTRAINT "animals_farm_id_farms_id_fk" FOREIGN KEY ("farm_id") REFERENCES "public"."farms"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "movements" ADD CONSTRAINT "movements_animal_id_animals_id_fk" FOREIGN KEY ("animal_id") REFERENCES "public"."animals"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "movements" ADD CONSTRAINT "movements_to_camp_id_camps_id_fk" FOREIGN KEY ("to_camp_id") REFERENCES "public"."camps"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "movements" ADD CONSTRAINT "movements_from_camp_id_camps_id_fk" FOREIGN KEY ("from_camp_id") REFERENCES "public"."camps"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "treatments" ADD CONSTRAINT "treatments_animal_id_animals_id_fk" FOREIGN KEY ("animal_id") REFERENCES "public"."animals"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "weights" ADD CONSTRAINT "weights_animal_id_animals_id_fk" FOREIGN KEY ("animal_id") REFERENCES "public"."animals"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "animals_tag_number_per_farm" ON "animals" USING btree ("farm_id","tag_number") WHERE "animals"."tag_number" is not null;