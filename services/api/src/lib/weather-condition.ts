/**
 * Open-Meteo's WMO weather codes, collapsed to the short words the field
 * screen and the office report actually need. Unlisted codes (fog variants
 * beyond what's mapped, etc.) fall back to "unknown" rather than throwing —
 * a note must still save if the weather lookup returns something odd.
 */
const CONDITIONS: Record<number, string> = {
  0: "clear",
  1: "mostly_clear",
  2: "partly_cloudy",
  3: "cloudy",
  45: "fog",
  48: "fog",
  51: "drizzle",
  53: "drizzle",
  55: "drizzle",
  61: "rain",
  63: "rain",
  65: "rain",
  71: "snow",
  73: "snow",
  75: "snow",
  80: "showers",
  81: "showers",
  82: "showers",
  95: "thunderstorm",
  96: "thunderstorm",
  99: "thunderstorm",
};

export function weatherCondition(code: number): string {
  return CONDITIONS[code] ?? "unknown";
}
