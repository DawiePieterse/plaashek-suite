import { useEffect, useRef, useState } from "react";
import { t } from "./copy.js";
import { enqueue, readQueue, settle } from "./queue.js";
import { fetchWeather, PairError, upload, type Claims } from "./ticket.js";

interface Fix {
  latitude: number;
  longitude: number;
  accuracy: number;
}

interface Weather {
  temp: number;
  humidity: number;
  condition: string;
}

/** Never let a slow weather lookup hold up the save (docs/veldnotas-reuse-audit.md: 1.5s race against a blank result). */
function raceWeather(ticket: string, fix: Fix): Promise<Weather | null> {
  return Promise.race([
    fetchWeather(ticket, fix.latitude, fix.longitude).catch(() => null),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), 1500)),
  ]);
}

/** Veldnotas capture. One job per screen, save is local and instant (plan §8). */
export function Notes({ ticket, claims }: { ticket: string; claims: Claims }) {
  const [body, setBody] = useState("");
  const [pending, setPending] = useState(readQueue().length);
  const [saved, setSaved] = useState(false);
  const [refused, setRefused] = useState("");
  const c = t();

  // Warmed up on screen-open so a fix is usually ready by the time the worker
  // taps save; never awaited, never blocks the save (reuse audit: GPS stamp).
  const fixRef = useRef<Fix | null>(null);

  async function flush() {
    if (readQueue().length === 0) return;
    try {
      const { accepted } = await upload(ticket, readQueue());
      setPending(settle(accepted).length);
      setRefused("");
    } catch (caught) {
      // The notes stay on the phone either way. No signal is normal and silent;
      // a "no" from the server is not — say it, or the count sits there forever.
      setRefused(caught instanceof PairError ? (c.errors[caught.code] ?? c.errors["unknown"]) : "");
    }
  }

  useEffect(() => {
    void flush();
    // A phone that finds signal at the gate should not need a tap to send.
    globalThis.addEventListener("online", flush);
    // Belt and braces for flaky rural radios that regain signal without firing "online".
    const poll = setInterval(flush, 10_000);
    return () => {
      globalThis.removeEventListener("online", flush);
      clearInterval(poll);
    };
  }, []);

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
      () => {}, // denied or no lock yet — the note saves without a stamp
      { enableHighAccuracy: true },
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  useEffect(() => {
    if (!saved) return;
    const id = setTimeout(() => setSaved(false), 2000);
    return () => clearTimeout(id);
  }, [saved]);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    const fix = fixRef.current;
    const weather = fix && navigator.onLine ? await raceWeather(ticket, fix) : null;

    setPending(
      enqueue({
        entity: "notes",
        entity_id: crypto.randomUUID(),
        client_time: new Date().toISOString(),
        season_id: claims.seasonId,
        payload: {
          body,
          latitude: fix?.latitude ?? null,
          longitude: fix?.longitude ?? null,
          location_accuracy_m: fix?.accuracy ?? null,
          weather_temp: weather?.temp ?? null,
          weather_humidity: weather?.humidity ?? null,
          weather_condition: weather?.condition ?? null,
        },
      }).length,
    );
    setBody("");
    setSaved(true);
    navigator.vibrate?.(60);
    void flush();
  }

  return (
    <main>
      <form onSubmit={save}>
        <label className="field">
          {c.noteLabel}
          <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={6} required autoFocus />
        </label>

        <button type="submit">{c.save}</button>
      </form>

      {saved && <p className="saved toast">{c.savedOnPhone}</p>}
      {refused && <p className="refused">{refused}</p>}

      <footer>
        {pending > 0 && <span className="badge">{pending}</span>}
        {pending > 0 ? c.waitingToSend(pending) : c.allSent}
      </footer>
    </main>
  );
}
