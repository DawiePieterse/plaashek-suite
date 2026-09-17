import { useState } from "react";
import { raceWeather, useFlush, useGpsFix, useSavedToast } from "./capture.js";
import { t } from "./copy.js";
import { enqueue } from "./queue.js";
import { type Claims } from "./ticket.js";

/** Veldnotas capture. One job per screen, save is local and instant (plan §8). */
export function Notes({ ticket, claims }: { ticket: string; claims: Claims }) {
  const [body, setBody] = useState("");
  const [saved, markSaved] = useSavedToast();
  const fixRef = useGpsFix();
  const { pending, setPending, refused, flush } = useFlush(ticket, t().errors);
  const c = t();

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
    markSaved();
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
