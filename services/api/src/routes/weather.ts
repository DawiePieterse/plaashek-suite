import { farms } from "@plaashek/schema";
import { eq } from "drizzle-orm";
import type { App, AppDeps } from "../app.js";
import { requireStaff } from "../auth/require-staff.js";
import { ApiError } from "../lib/errors.js";
import { requireDeviceTicket } from "../lib/device-ticket.js";
import { coordsPair } from "../lib/farm.js";
import { coordinatesSchema, fetchCurrentWeather } from "../lib/open-meteo.js";

/**
 * Server-proxied weather stamps. The phone asks with its own GPS fix; the
 * office asks with no coordinates at all and gets the farm's stored ones —
 * set in the Farm Admin Tool's settings. Open-Meteo itself lives in
 * lib/open-meteo.ts.
 */
export function registerWeatherRoutes(app: App, deps: AppDeps) {
  app.get("/weather/current", async (request) => {
    await requireDeviceTicket(request.headers, deps);
    const { lat, lon } = coordinatesSchema.parse(request.query);

    return fetchCurrentWeather(lat, lon);
  });

  app.get("/farm/weather", { preHandler: requireStaff(deps.env.staffSessionSecret, ["admin", "owner"]) }, async (request) => {
    const [farm] = await deps.db
      .select({ latitude: farms.latitude, longitude: farms.longitude })
      .from(farms)
      .where(eq(farms.id, request.staff!.farmId));

    const coords = coordsPair(farm?.latitude ?? null, farm?.longitude ?? null);
    if (!coords) throw new ApiError(409, "no_coordinates", "The farm has no coordinates set");

    return fetchCurrentWeather(coords.lat, coords.lon);
  });
}
