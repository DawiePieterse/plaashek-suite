/**
 * Bootstraps or resets one Plaashek Management login — the console has no
 * self-signup (plan §3.1: Plaashek staff is a separate login, staff-only).
 * Non-destructive: upserts by email, safe to re-run to rotate a password.
 *
 *   pnpm create-staff -- --email=me@plaashek.co.za --password=...
 */
import { fileURLToPath } from "node:url";
import { plaashekStaff } from "@plaashek/schema";
import { eq } from "drizzle-orm";
import { hashPassword } from "../src/auth/password.js";
import { createDb } from "../src/db.js";

function arg(name: string): string | undefined {
  return process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
}

const email = arg("email");
const password = arg("password");
if (!email || !password) throw new Error("Usage: pnpm create-staff -- --email=... --password=...");

try {
  process.loadEnvFile(fileURLToPath(new URL("../../../.env", import.meta.url)));
} catch {
  // No .env — fall through to whatever the process already has.
}

const databaseUrl = process.env["DATABASE_URL"];
if (!databaseUrl) throw new Error("Missing required env var: DATABASE_URL");

const db = createDb(databaseUrl);
const passwordHash = hashPassword(password);

const [existing] = await db.select({ id: plaashekStaff.id }).from(plaashekStaff).where(eq(plaashekStaff.email, email));

if (existing) {
  await db.update(plaashekStaff).set({ passwordHash }).where(eq(plaashekStaff.id, existing.id));
  console.log(`Password updated for ${email}`);
} else {
  await db.insert(plaashekStaff).values({ email, passwordHash });
  console.log(`Created Plaashek Management login: ${email}`);
}

process.exit(0);
