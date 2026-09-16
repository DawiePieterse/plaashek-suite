import cors from "@fastify/cors";
import Fastify from "fastify";
import { ZodError } from "zod";
import { registerAuthRoutes } from "./routes/auth.js";
import { registerDeviceRoutes } from "./routes/devices.js";
import { registerFarmRoutes } from "./routes/farm.js";
import { registerJwksRoutes } from "./routes/jwks.js";
import { registerPairingRoutes } from "./routes/pairing.js";
import { registerTicketRoutes } from "./routes/tickets.js";
import type { Db } from "./db.js";
import type { Env } from "./env.js";
import { ApiError } from "./lib/errors.js";
import type { SigningKeys } from "./keys.js";

export interface AppDeps {
  db: Db;
  keys: SigningKeys;
  env: Env;
}

export function buildApp(deps: AppDeps) {
  const app = Fastify({ logger: true });

  app.register(cors, { origin: deps.env.corsOrigins });

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof ApiError) {
      reply.status(error.statusCode).send({ error: { code: error.code, message: error.message } });
      return;
    }

    if (error instanceof ZodError) {
      reply.status(400).send({ error: { code: "validation_error", message: error.message } });
      return;
    }

    app.log.error(error);
    reply.status(500).send({ error: { code: "internal_error", message: "Internal error" } });
  });

  registerAuthRoutes(app, deps);
  registerFarmRoutes(app, deps);
  registerDeviceRoutes(app, deps);
  registerPairingRoutes(app, deps);
  registerTicketRoutes(app, deps);
  registerJwksRoutes(app, deps);

  return app;
}

export type App = ReturnType<typeof buildApp>;
