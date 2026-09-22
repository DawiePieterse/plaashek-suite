import { z } from "zod";
import { ApiError } from "./errors.js";
import { weatherCondition } from "./weather-condition.js";

/** What a valid coordinate pair is, for every route that takes one. Coerced, so it reads query strings and JSON alike. */
export const coordinatesSchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lon: z.coerce.number().min(-180).max(180),
});

interface OpenMeteoResponse {
  current: { temperature_2m: number; relative_humidity_2m: number; weather_code: number };
}

export interface CurrentWeather {
  temp: number;
  humidity: number;
  condition: string;
}

/**
 * Answers within this window and radius share one upstream call: Open-Meteo's
 * "current" data has ~15-minute granularity and a grid coarser than ~1 km, so
 * a fresher or finer-grained fetch would return the same numbers anyway. The
 * cache holds the promise, so concurrent callers coalesce too.
 */
const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, { at: number; weather: Promise<CurrentWeather> }>();

/**
 * The one place the suite talks to Open-Meteo (docs/veldnotas-reuse-audit.md).
 * No API key — the whole reason it's the pick for a one-developer project with
 * nothing to rotate or bill. Swap providers here only, if it's ever outgrown.
 */
export function fetchCurrentWeather(lat: number, lon: number): Promise<CurrentWeather> {
  const key = `${lat.toFixed(2)},${lon.toFixed(2)}`;
  const cached = cache.get(key);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.weather;

  // Field phones ask with their own GPS fix, so keys accumulate — sweep the expired ones before adding another.
  if (cache.size > 256) {
    for (const [staleKey, entry] of cache) if (Date.now() - entry.at >= CACHE_TTL_MS) cache.delete(staleKey);
  }

  const weather = fetchFresh(lat, lon);
  cache.set(key, { at: Date.now(), weather });
  // A failed lookup must not be the cached answer for the next five minutes.
  weather.catch(() => cache.delete(key));
  return weather;
}

async function fetchFresh(lat: number, lon: number): Promise<CurrentWeather> {
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
}
