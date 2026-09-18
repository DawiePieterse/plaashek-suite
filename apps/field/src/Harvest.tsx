import { useEffect, useState } from "react";
import { CardScanner, normaliseCardCode } from "./CardScanner.js";
import { raceWeather, useFlush, useGpsFix, useSavedToast } from "./capture.js";
import { t } from "./copy.js";
import { enqueue } from "./queue.js";
import { fetchBlocks, fetchWorkerCards, type Claims } from "./ticket.js";

interface Block {
  id: string;
  name: string;
}

interface WorkerCard {
  code: string;
  personId: string;
  personName: string;
}

const BLOCKS_KEY = "plaashek.field.blocks";
const CARDS_KEY = "plaashek.field.cards";

function readCached<T>(key: string): T[] {
  try {
    return JSON.parse(globalThis.localStorage?.getItem(key) ?? "[]");
  } catch {
    return [];
  }
}

/** Boord capture. Block + weight + optional deduction, and — for a farm paying per kg — the picker's scanned card (ADR 0009). */
export function Harvest({ ticket, claims }: { ticket: string; claims: Claims }) {
  const [blocks, setBlocks] = useState<Block[]>(() => readCached<Block>(BLOCKS_KEY));
  const [cards, setCards] = useState<WorkerCard[]>(() => readCached<WorkerCard>(CARDS_KEY));
  const [blockId, setBlockId] = useState("");
  const [weightKg, setWeightKg] = useState("");
  const [deductionKg, setDeductionKg] = useState("");
  /** The card scanned for the crates being weighed now. Kept between saves — one picker fills several crates. */
  const [picker, setPicker] = useState<{ code: string; name: string | null } | null>(null);
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

    // Cached so a scan resolves to a name with no signal. An unknown code is
    // still saved (plan §8) and resolved by the server at sync.
    fetchWorkerCards(ticket)
      .then(({ cards: fresh }) => {
        setCards(fresh);
        globalThis.localStorage?.setItem(CARDS_KEY, JSON.stringify(fresh));
      })
      .catch(() => {});
  }, [ticket]);

  function scanned(code: string) {
    const known = cards.find((card) => normaliseCardCode(card.code) === code);
    setPicker({ code, name: known?.personName ?? null });
  }

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
          picker_card_code: picker?.code ?? null,
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
      <section className="picker">
        {picker ? (
          <p className="status">
            {picker.name ?? c.unknownCard(picker.code)}{" "}
            <button type="button" className="quiet" onClick={() => setPicker(null)}>
              {c.changeCard}
            </button>
          </p>
        ) : (
          <CardScanner onCode={scanned} />
        )}
      </section>

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
