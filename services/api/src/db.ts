import * as schema from "@plaashek/schema";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

export type Db = ReturnType<typeof createDb>;

export function createDb(databaseUrl: string) {
  const pool = new Pool({ connectionString: databaseUrl });
  return drizzle(pool, { schema });
}
