import { fileURLToPath } from "node:url";

const REPO_ROOT_ENV = fileURLToPath(new URL("../../../.env", import.meta.url));

export interface Env {
  databaseUrl: string;
  ticketSigningKeyJwk: string;
  staffSessionSecret: string;
  port: number;
  corsOrigins: string[];
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

/** Loads .env (Node's built-in loader) then reads/validates the vars this service needs. */
export function loadEnv(): Env {
  try {
    process.loadEnvFile(REPO_ROOT_ENV);
  } catch {
    // No .env file (e.g. env already provided by the process manager) — fine.
  }

  return {
    databaseUrl: required("DATABASE_URL"),
    ticketSigningKeyJwk: required("TICKET_SIGNING_KEY_JWK"),
    staffSessionSecret: required("STAFF_SESSION_SECRET"),
    port: Number(process.env["PORT"] ?? 8080),
    corsOrigins: (process.env["CORS_ORIGINS"] ?? "").split(",").filter(Boolean),
  };
}
