import { buildApp } from "./app.js";
import { createDb } from "./db.js";
import { loadEnv } from "./env.js";
import { loadSigningKeys } from "./keys.js";

const env = loadEnv();
const db = createDb(env.databaseUrl);
const keys = await loadSigningKeys(env.ticketSigningKeyJwk);

const app = buildApp({ db, keys, env });

await app.listen({ port: env.port, host: "0.0.0.0" });

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, async () => {
    await app.close();
    process.exit(0);
  });
}
