ALTER TABLE "worker_cards" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "worker_cards" CASCADE;--> statement-breakpoint
ALTER TABLE "people" ADD COLUMN "worker_number" text;--> statement-breakpoint
ALTER TABLE "people" ADD COLUMN "active" boolean DEFAULT true NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "people_worker_number_per_farm" ON "people" USING btree ("farm_id","worker_number") WHERE "people"."worker_number" is not null;