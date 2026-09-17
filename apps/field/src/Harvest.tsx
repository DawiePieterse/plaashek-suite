import { useEffect, useState } from "react";
import { raceWeather, useFlush, useGpsFix, useSavedToast } from "./capture.js";
import { t } from "./copy.js";
import { enqueue } from "./queue.js";
import { fetchBlocks, type Claims } from "./ticket.js";

interface Block {
  id: string;
  name: string;
}

const BLOCKS_KEY = "plaashek.field.blocks";

function readCachedBlocks(): Block[] {
  try {
    return JSON.parse(globalThis.localStorage?.getItem(BLOCKS_KEY) ?? "[]");
  } catch {
    return [];
  }
}

/** Boord capture. Block + weight + optional deduction — same shape as Notes.tsx (ADR 0007). */
export function Harvest({ ticket, claims }: { ticket: string; claims: Claims }) {
  const [blocks, setBlocks] = useState<Block[]>(readCachedBlocks);
  const [blockId, setBlockId] = useState("");
  const [weightKg, setWeightKg] = useState("");
  const [deductionKg, setDeductionKg] = useState("");
  const [saved, markSaved] = useSavedToast();
  const fixRef = useGpsFix();
  const { pending, setPending, refused, flush } = useFlush(ticket, t().errors);
  const c = t();

  useEffect(() => {
    fetchBlocks(ticket)
      .then(({ blocks: fresh }) => {
        setBlocks(fresh);
        globalThis.localStorage?.setItem(BLOCKS_KEY, JSON.stringify(fresh));
      })
      .catch(() => {}); // offline — the cached list stands
  }, [ticket]);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    const fix = fixRef.current;
    const weather = fix && navigator.onLine ? await raceWeather(ticket, fix) : null;

    setPending(
      enqueue({
        entity: "harvest_events",
        entity_id: crypto.randomUUID(),
        client_time: new Date().toISOString(),
        season_id: claims.seasonId,
        payload: {
          block_id: blockId,
          weight_kg: Number(weightKg),
          deduction_kg: deductionKg ? Number(deductionKg) : null,
          weather_temp: weather?.temp ?? null,
          weather_humidity: weather?.humidity ?? null,
          weather_condition: weather?.condition ?? null,
        },
      }).length,
    );
    setWeightKg("");
    setDeductionKg("");
    markSaved();
    navigator.vibrate?.(60);
    void flush();
  }

  return (
    <main>
      <form onSubmit={save}>
        <label className="field">
          {c.blockLabel}
          <select value={blockId} onChange={(e) => setBlockId(e.target.value)} required autoFocus>
            <option value="" disabled>
              {c.chooseBlock}
            </option>
            {blocks.map((block) => (
              <option key={block.id} value={block.id}>
                {block.name}
              </option>
            ))}
          </select>
        </label>

        {blocks.length === 0 && <p className="refused">{c.noBlocks}</p>}

        <label className="field">
          {c.weightLabel}
          <input type="number" inputMode="decimal" min="0" step="0.1" value={weightKg} onChange={(e) => setWeightKg(e.target.value)} required />
        </label>

        <label className="field">
          {c.deductionLabel}
          <input type="number" inputMode="decimal" min="0" step="0.1" value={deductionKg} onChange={(e) => setDeductionKg(e.target.value)} />
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
