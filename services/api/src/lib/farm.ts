import { farms, seasons } from "@plaashek/schema";
import type { Language } from "@plaashek/tickets";
import { and, eq } from "drizzle-orm";
import type { Db } from "../db.js";
import { notFound } from "./errors.js";

/** English in the database, the farm's own language on screen (plan §6) — chosen when the farm is set up. */
export async function farmLanguage(db: Pick<Db, "select">, farmId: string): Promise<Language> {
  const [farm] = await db.select({ language: farms.language }).from(farms).where(eq(farms.id, farmId));
  if (!farm) throw notFound();
  return farm.language;
}

/**
 * The farm's one active season, or null. Rides in the ticket so an offline phone
 * can stamp `season_id` itself (docs/seasons-and-stamping.md); it moves to the
 * phone's synced copy of master data once sync is real.
 */
export async function activeSeasonId(db: Pick<Db, "select">, farmId: string): Promise<string | null> {
  const [season] = await db
    .select({ id: seasons.id })
    .from(seasons)
    .where(and(eq(seasons.farmId, farmId), eq(seasons.isActive, true)));

  return season?.id ?? null;
}
