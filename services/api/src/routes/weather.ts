import { z } from "zod";
import type { App, AppDeps } from "../app.js";
import { ApiError } from "../lib/errors.js";
import { requireDeviceTicket } from "../lib/device-ticket.js";
import { weatherCondition } from "../lib/weather-condition.js";

const querySchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lon: z.coerce.number().min(-180).max(180),
});

interface OpenMeteoResponse {
  current: { temperature_2m: number; relative_humidity_2m: number; weather_code: number };
}

/**
 * Server-proxied weather stamp (docs/veldnotas-reuse-audit.md). Open-Meteo
 * needs no API key — the whole reason it's the pick for a one-developer
 * project with nothing to rotate or bill. Swap providers here only, if it's
 * ever outgrown.
 */
export function registerWeatherRoutes(app: App, deps: AppDeps) {
  app.get("/weather/current", async (request) => {
    await requireDeviceTicket(request.headers, deps);
    const { lat, lon } = querySchema.parse(request.query);

    const response = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,weather_code`,
    );
    if (!response.ok) throw new ApiError(502, "weather_unavailable", "Weather lookup failed");

    const data = (await response.json()) as OpenMeteoResponse;
    return {
      temp: data.current.temperature_2m,
      humidity: data.current.relative_humidity_2m,
      condition: weatherCondition(data.current.weather_code),
    };
  });
}
