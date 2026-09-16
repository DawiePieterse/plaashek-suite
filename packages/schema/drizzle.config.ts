import { defineConfig } from "drizzle-kit";

/**
 * `generate` only reads src/tables/*.ts, no DB connection needed.
 * `migrate`/`push` need DATABASE_URL (self-hosted Postgres, af-south-1 — plan §9).
 */
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/tables/*.ts",
  out: "../../services/migrations",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "",
  },
});
