import { blocks, farms, seasons } from "@plaashek/schema";
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

/** Picker data: block id + name for a farm. Shared by the field app's `GET /blocks` and the office's `GET /farm`. */
export async function listFarmBlocks(db: Pick<Db, "select">, farmId: string) {
  return db.select({ id: blocks.id, name: blocks.name }).from(blocks).where(eq(blocks.farmId, farmId)).orderBy(asc(blocks.name));
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
