import { assets, blocks, farms, seasons } from "@plaashek/schema";
import type { Language } from "@plaashek/tickets";
import { and, asc, eq } from "drizzle-orm";
import type { PgColumn, PgTable } from "drizzle-orm/pg-core";
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

/** Picker data: block id + name for a farm. Shared by the field app's `GET /blocks` and the office's `GET /farm`. */
export async function listFarmBlocks(db: Pick<Db, "select">, farmId: string) {
  return db.select({ id: blocks.id, name: blocks.name }).from(blocks).where(eq(blocks.farmId, farmId)).orderBy(asc(blocks.name));
}

/** Picker data: asset id + name for a farm — Water's meters and Werkswinkel's equipment share this one list (ADR 0014). */
export async function listFarmAssets(db: Pick<Db, "select">, farmId: string) {
  return db.select({ id: assets.id, name: assets.name }).from(assets).where(eq(assets.farmId, farmId)).orderBy(asc(assets.name));
}

/**
 * A foreign key only proves the row exists, not that it's this farm's —
 * plan §6: no cross-farm foreign keys. One place for the
 * `select id where id = ? and farm_id = ?, else 404` check every route that
 * accepts a farm-scoped id in its body needs to run before using it.
 */
export async function assertFarmOwns(db: Pick<Db, "select">, table: PgTable, idColumn: PgColumn, farmIdColumn: PgColumn, id: string, farmId: string): Promise<void> {
  const [row] = await db
    .select({ id: idColumn })
    .from(table)
    .where(and(eq(idColumn, id), eq(farmIdColumn, farmId)));
  if (!row) throw notFound();
}
