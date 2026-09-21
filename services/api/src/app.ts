import cors from "@fastify/cors";
import Fastify from "fastify";
import { ZodError } from "zod";
import { registerAuthRoutes } from "./routes/auth.js";
import { registerBlockRoutes, registerCampRoutes } from "./routes/blocks.js";
import { registerDeviceRoutes } from "./routes/devices.js";
import { registerEienaarRoutes } from "./routes/eienaar.js";
import { registerExportRoutes } from "./routes/export.js";
import { registerFarmRoutes } from "./routes/farm.js";
import { registerJwksRoutes } from "./routes/jwks.js";
import { registerKuddeRoutes } from "./routes/kudde.js";
import { registerManagementRoutes } from "./routes/management.js";
import { registerMasterDataRoutes } from "./routes/master-data.js";
import { registerPairingRoutes } from "./routes/pairing.js";
import { registerPieceworkRoutes } from "./routes/piecework.js";
import { registerSeasonRoutes } from "./routes/seasons.js";
import { registerStockRoutes } from "./routes/stock.js";
import { registerSyncRoutes } from "./routes/sync.js";
import { registerWaterRoutes } from "./routes/water.js";
import { registerWerkswinkelRoutes } from "./routes/werkswinkel.js";
import { registerTicketRoutes } from "./routes/tickets.js";
import { registerWeatherRoutes } from "./routes/weather.js";
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

  // `content-disposition` is not a CORS-safelisted response header: without
  // this the office tools cannot read the filename the export routes set, and
  // every download lands under a generic name.
  app.register(cors, { origin: deps.env.corsOrigins, exposedHeaders: ["content-disposition"] });

  // The worker-register import is a file the farm already has, posted as-is
  // rather than re-encoded into JSON by the browser.
  app.addContentTypeParser("text/csv", { parseAs: "string" }, (_request, body, done) => done(null, body));

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
  registerSeasonRoutes(app, deps);
  registerPairingRoutes(app, deps);
  registerTicketRoutes(app, deps);
  registerSyncRoutes(app, deps);
  registerWeatherRoutes(app, deps);
  registerJwksRoutes(app, deps);
  registerBlockRoutes(app, deps);
  registerCampRoutes(app, deps);
  registerKuddeRoutes(app, deps);
  registerEienaarRoutes(app, deps);
  registerExportRoutes(app, deps);
  registerPieceworkRoutes(app, deps);
  registerManagementRoutes(app, deps);
  registerMasterDataRoutes(app, deps);
  registerStockRoutes(app, deps);
  registerWaterRoutes(app, deps);
  registerWerkswinkelRoutes(app, deps);

  return app;
}

export type App = ReturnType<typeof buildApp>;
