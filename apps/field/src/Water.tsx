import { useEffect, useState } from "react";
import { useFlush, useSavedToast } from "./capture.js";
import { t } from "./copy.js";
import { enqueue } from "./queue.js";
import { readStored, writeStored } from "./storage.js";
import { fetchWaterPoints, type Claims } from "./ticket.js";

interface Point {
  id: string;
  name: string;
  unit: string;
}

const POINTS_KEY = "plaashek.field.water-points";

/**
 * Water capture (docs/water-build-scope.md): a point, a reading, an
 * optional note. No block, no GPS, no weather — the point already says
 * where, and a meter reading is not an observation of the crop.
 */
export function Water({ ticket, claims }: { ticket: string; claims: Claims }) {
  const [points, setPoints] = useState<Point[]>(() => readStored<Point[]>(POINTS_KEY, []));
  const [pointId, setPointId] = useState("");
  const [reading, setReading] = useState("");
  const [note, setNote] = useState("");
  const [saved, markSaved] = useSavedToast();
  const { pending, setPending, refused, flush } = useFlush(ticket, t().errors);
  const c = t();

  useEffect(() => {
    fetchWaterPoints(ticket)
      .then(({ points: fresh }) => {
        setPoints(fresh);
        writeStored(POINTS_KEY, fresh);
      })
      .catch(() => {}); // offline — the cached list stands
  }, [ticket]);

  function save(event: React.FormEvent) {
    event.preventDefault();

    setPending(
      enqueue({
        entity: "meter_readings",
        entity_id: crypto.randomUUID(),
        client_time: new Date().toISOString(),
        // Water is season-less (plan §6, §8) — never stamped, even offline.
        season_id: null,
        payload: {
          water_point_id: pointId,
          reading: Number(reading),
          note: note.trim() || null,
        },
      }).length,
    );
    setReading("");
    setNote("");
    markSaved();
    navigator.vibrate?.(60);
    void flush();
  }

  return (
    <main>
      <form onSubmit={save}>
        <label className="field">
          {c.pointLabel}
          <select value={pointId} onChange={(e) => setPointId(e.target.value)} required autoFocus>
            <option value="" disabled>
              {c.choosePoint}
            </option>
            {points.map((point) => (
              <option key={point.id} value={point.id}>
                {point.name} ({point.unit})
              </option>
            ))}
          </select>
        </label>

        {points.length === 0 && <p className="refused">{c.noPoints}</p>}

        <label className="field">
          {c.readingLabel}
          <input type="number" inputMode="decimal" step="0.01" value={reading} onChange={(e) => setReading(e.target.value)} required />
        </label>

        <label className="field">
          {c.noteLabelOptional}
          <input type="text" value={note} onChange={(e) => setNote(e.target.value)} />
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
