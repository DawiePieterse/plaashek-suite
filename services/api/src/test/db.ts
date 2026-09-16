import * as schema from "@plaashek/schema";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import type { Db } from "../db.js";

const ROLLBACK = Symbol("test-rollback");

/** Runs `fn` inside a Postgres transaction (nested `db.transaction()` calls become savepoints) and always rolls it back. */
export async function withTestDb<T>(fn: (db: Db) => Promise<T>): Promise<T> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required to run this test");

  const pool = new Pool({ connectionString: databaseUrl });
  const db = drizzle(pool, { schema }) as unknown as Db;
  let result: T;

  try {
    await db.transaction(async (tx) => {
      result = await fn(tx as unknown as Db);
      throw ROLLBACK;
    });
  } catch (error) {
    if (error !== ROLLBACK) throw error;
  } finally {
    await pool.end();
  }

  return result!;
}
