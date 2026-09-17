import { useEffect, useRef, useState } from "react";
import { readQueue, settle } from "./queue.js";
import { fetchWeather, PairError, upload } from "./ticket.js";

/** Shared by every field capture screen (Notes, Harvest, ...) — one outbox, one flush, one GPS watch. */
export interface Fix {
  latitude: number;
  longitude: number;
  accuracy?: number;
}

export interface Weather {
  temp: number;
  humidity: number;
  condition: string;
}

/** Never let a slow weather lookup hold up the save (docs/veldnotas-reuse-audit.md: 1.5s race against a blank result). */
export function raceWeather(ticket: string, fix: Fix): Promise<Weather | null> {
  return Promise.race([
    fetchWeather(ticket, fix.latitude, fix.longitude).catch(() => null),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), 1500)),
  ]);
}

/**
 * Warmed up on screen-open so a fix is usually ready by the time the worker
 * taps save; never awaited, never blocks the save (reuse audit: GPS stamp).
 */
export function useGpsFix() {
  const fixRef = useRef<Fix | null>(null);

  useEffect(() => {
    if (!navigator.geolocation) return;
    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        fixRef.current = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
        };
      },
      () => {}, // denied or no lock yet — the capture saves without a stamp
      { enableHighAccuracy: true },
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  return fixRef;
}

/** Flushes the local outbox on mount, on `online`, and a 10s poll for flaky rural radios that regain signal without firing the event. */
export function useFlush(ticket: string, errors: Record<string, string>) {
  const [pending, setPending] = useState(readQueue().length);
  const [refused, setRefused] = useState("");

  async function flush() {
    if (readQueue().length === 0) return;
    try {
      const { accepted } = await upload(ticket, readQueue());
      setPending(settle(accepted).length);
      setRefused("");
    } catch (caught) {
      // The captures stay on the phone either way. No signal is normal and silent;
      // a "no" from the server is not — say it, or the count sits there forever.
      setRefused(caught instanceof PairError ? (errors[caught.code] ?? errors["unknown"]) : "");
    }
  }

  useEffect(() => {
    void flush();
    // A phone that finds signal at the gate should not need a tap to send.
    globalThis.addEventListener("online", flush);
    const poll = setInterval(flush, 10_000);
    return () => {
      globalThis.removeEventListener("online", flush);
      clearInterval(poll);
    };
  }, []);

  return { pending, setPending, refused, flush };
}

/** The "Gestoor op die foon" toast, shown for 2s after a save. */
export function useSavedToast(): [boolean, () => void] {
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!saved) return;
    const id = setTimeout(() => setSaved(false), 2000);
    return () => clearTimeout(id);
  }, [saved]);

  return [saved, () => setSaved(true)];
}
