import type { App, AppDeps } from "../app.js";

export function registerJwksRoutes(app: App, deps: AppDeps) {
  app.get("/.well-known/jwks.json", async () => deps.keys.jwks);
}
