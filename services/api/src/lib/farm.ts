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

export interface ActiveSeason {
  id: string;
  name: string;
  startsOn: string;
  endsOn: string;
}

/**
 * The farm's one active season, or null — one active per farm is a partial
 * unique index in the schema, so this is a lookup, not a choice. Every rollup,
 * export and rate reads it from here rather than restating the query.
 */
export async function activeSeason(db: Pick<Db, "select">, farmId: string): Promise<ActiveSeason | null> {
  const [season] = await db
    .select({ id: seasons.id, name: seasons.name, startsOn: seasons.startsOn, endsOn: seasons.endsOn })
    .from(seasons)
    .where(and(eq(seasons.farmId, farmId), eq(seasons.isActive, true)));

  return season ?? null;
}

/**
 * Just the id — what rides in the ticket, so an offline phone can stamp
 * `season_id` itself (docs/seasons-and-stamping.md).
 */
export async function activeSeasonId(db: Pick<Db, "select">, farmId: string): Promise<string | null> {
  return (await activeSeason(db, farmId))?.id ?? null;
}
