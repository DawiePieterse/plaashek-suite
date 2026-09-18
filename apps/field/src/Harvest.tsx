import { useEffect, useState } from "react";
import { CardScanner, normaliseWorkerNumber } from "./CardScanner.js";
import { raceWeather, useFlush, useGpsFix, useSavedToast } from "./capture.js";
import { t } from "./copy.js";
import { enqueue } from "./queue.js";
import { readStored, writeStored } from "./storage.js";
import { fetchBlocks, fetchPickers, type Claims } from "./ticket.js";

interface Block {
  id: string;
  name: string;
}

interface Picker {
  workerNumber: string;
  personId: string;
  personName: string;
}

const BLOCKS_KEY = "plaashek.field.blocks";
const PICKERS_KEY = "plaashek.field.pickers";

/** Boord capture. Block + weight + optional deduction, and — for a farm paying per kg — the picker's scanned card (ADR 0009). */
export function Harvest({ ticket, claims }: { ticket: string; claims: Claims }) {
  const [blocks, setBlocks] = useState<Block[]>(() => readStored<Block[]>(BLOCKS_KEY, []));
  const [pickers, setPickers] = useState<Picker[]>(() => readStored<Picker[]>(PICKERS_KEY, []));
  const [blockId, setBlockId] = useState("");
  const [weightKg, setWeightKg] = useState("");
  const [deductionKg, setDeductionKg] = useState("");
  /**
   * The worker number scanned for the crates being weighed now — the number
   * only, with the name looked up at render. Kept between saves, because one
   * picker fills several crates.
   */
  const [pickerNumber, setPickerNumber] = useState<string | null>(null);
  const [saved, markSaved] = useSavedToast();
  const fixRef = useGpsFix();
  const { pending, setPending, refused, flush } = useFlush(ticket, t().errors);
  const c = t();

  useEffect(() => {
    fetchBlocks(ticket)
      .then(({ blocks: fresh }) => {
        setBlocks(fresh);
        writeStored(BLOCKS_KEY, fresh);
      })
      .catch(() => {}); // offline — the cached list stands

    // Cached so a scan resolves to a name with no signal. An unknown number is
    // still saved (plan §8) and resolved by the server at sync.
    fetchPickers(ticket)
      .then(({ pickers: fresh }) => {
        setPickers(fresh);
        writeStored(PICKERS_KEY, fresh);
      })
      .catch(() => {});
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
          // Only ever the code: the server decides whose crate this is.
          picker_card_code: pickerNumber,
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
      {/* A farm that does not pay per kilogram has no numbered pickers, so it
          is never asked to scan — ADR 0009 promises Boord is unchanged for them. */}
      {pickers.length > 0 && (
        <section className="picker">
          {pickerNumber ? (
            <p className="status">
              {/* Looked up each render: a register that lands a second after the scan still names the picker. */}
              {pickers.find((picker) => normaliseWorkerNumber(picker.workerNumber) === pickerNumber)?.personName ?? c.unknownCard(pickerNumber)}{" "}
              <button type="button" className="quiet" onClick={() => setPickerNumber(null)}>
                {c.changeCard}
              </button>
            </p>
          ) : (
            <CardScanner onCode={setPickerNumber} />
          )}
        </section>
      )}

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
