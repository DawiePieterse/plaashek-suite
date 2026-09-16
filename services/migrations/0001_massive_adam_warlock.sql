CREATE TYPE "public"."farm_language" AS ENUM('af', 'en');--> statement-breakpoint
ALTER TABLE "farms" ADD COLUMN "language" "farm_language" DEFAULT 'af' NOT NULL;