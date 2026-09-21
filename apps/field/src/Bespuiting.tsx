import { useEffect, useState } from "react";
import { raceWeather, useFlush, useGpsFix, useSavedToast } from "./capture.js";
import { t } from "./copy.js";
import { enqueue } from "./queue.js";
import { readStored, writeStored } from "./storage.js";
import { fetchBlocks, fetchSprayCatalog, fetchStockItems, fetchWaterPoints, type Claims } from "./ticket.js";

interface Item {
  id: string;
  name: string;
  unit: string;
}

interface Block {
  id: string;
  name: string;
}

interface Point {
  id: string;
  name: string;
  unit: string;
}

interface Registration {
  itemId: string;
  activeIngredient: string;
  defaultReason: string | null;
  withholdingPeriod: string | null;
}

const ITEMS_KEY = "plaashek.field.bespuiting.items";
const BLOCKS_KEY = "plaashek.field.bespuiting.blocks";
const POINTS_KEY = "plaashek.field.bespuiting.points";
const REGISTRATIONS_KEY = "plaashek.field.bespuiting.registrations";

/**
 * Bespuiting capture (docs/bespuiting-build-scope.md): block, product, how
 * much, plus the compliance fields Stoor deliberately never carries.
 * Picking a registered product prefills the reason and shows a
 * withholding-period hint, offline, from the cached catalog. A water point
 * and reading are optional — a foliar spray has neither, a fertigation run
 * through a Kraan has both. Like every other screen, GPS and weather are
 * stamped silently at save time; there is no operator field, because "who"
 * is the device's assigned person, not a picker on screen.
 */
export function Bespuiting({ ticket, claims }: { ticket: string; claims: Claims }) {
  const [items, setItems] = useState<Item[]>(() => readStored<Item[]>(ITEMS_KEY, []));
  const [blocks, setBlocks] = useState<Block[]>(() => readStored<Block[]>(BLOCKS_KEY, []));
  const [points, setPoints] = useState<Point[]>(() => readStored<Point[]>(POINTS_KEY, []));
  const [registrations, setRegistrations] = useState<Registration[]>(() => readStored<Registration[]>(REGISTRATIONS_KEY, []));

  const [blockId, setBlockId] = useState("");
  const [itemId, setItemId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [concentration, setConcentration] = useState("");
  const [reason, setReason] = useState("");
  const [method, setMethod] = useState("");
  const [pointId, setPointId] = useState("");
  const [reading, setReading] = useState("");

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

    fetchStockItems(ticket)
      .then(({ items: fresh }) => {
        setItems(fresh);
        writeStored(ITEMS_KEY, fresh);
      })
      .catch(() => {});

    fetchWaterPoints(ticket)
      .then(({ points: fresh }) => {
        setPoints(fresh);
        writeStored(POINTS_KEY, fresh);
      })
      .catch(() => {});

    fetchSprayCatalog(ticket)
      .then(({ registrations: fresh }) => {
        setRegistrations(fresh);
        writeStored(REGISTRATIONS_KEY, fresh);
      })
      .catch(() => {});
  }, [ticket]);

  const registration = registrations.find((entry) => entry.itemId === itemId) ?? null;

  function chooseItem(id: string) {
    setItemId(id);
    const found = registrations.find((entry) => entry.itemId === id);
    if (found?.defaultReason) setReason(found.defaultReason);
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    const fix = fixRef.current;
    const weather = fix && navigator.onLine ? await raceWeather(ticket, fix) : null;

    setPending(
      enqueue({
        entity: "spray_applications",
        entity_id: crypto.randomUUID(),
        client_time: new Date().toISOString(),
        season_id: claims.seasonId,
        payload: {
          block_id: blockId,
          item_id: itemId,
          quantity: Number(quantity),
          concentration: concentration.trim() || null,
          reason: reason.trim() || null,
          method: method.trim() || null,
          water_point_id: pointId || null,
          meter_reading: pointId && reading ? Number(reading) : null,
          latitude: fix?.latitude ?? null,
          longitude: fix?.longitude ?? null,
          location_accuracy_m: fix?.accuracy ?? null,
          weather_temp: weather?.temp ?? null,
          weather_humidity: weather?.humidity ?? null,
          weather_condition: weather?.condition ?? null,
        },
      }).length,
    );
    setQuantity("");
    setConcentration("");
    setReason("");
    setMethod("");
    setPointId("");
    setReading("");
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
          {c.stockItemLabel}
          <select value={itemId} onChange={(e) => chooseItem(e.target.value)} required>
            <option value="" disabled>
              {c.chooseItem}
            </option>
            {items.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name} ({item.unit})
              </option>
            ))}
          </select>
        </label>

        {items.length === 0 && <p className="refused">{c.noItems}</p>}
        {registration?.withholdingPeriod && <p className="note">{c.withholdingHint(registration.withholdingPeriod)}</p>}

        <label className="field">
          {c.quantityLabel}
          <input type="number" inputMode="decimal" min="0" step="0.01" value={quantity} onChange={(e) => setQuantity(e.target.value)} required />
        </label>

        <label className="field">
          {c.concentrationLabelOptional}
          <input type="text" value={concentration} onChange={(e) => setConcentration(e.target.value)} />
        </label>

        <label className="field">
          {c.reasonLabelOptional}
          <input type="text" value={reason} onChange={(e) => setReason(e.target.value)} />
        </label>

        <label className="field">
          {c.methodLabelOptional}
          <input type="text" value={method} onChange={(e) => setMethod(e.target.value)} />
        </label>

        <label className="field">
          {c.pointLabelOptional}
          <select value={pointId} onChange={(e) => setPointId(e.target.value)}>
            <option value="">{c.choosePoint}</option>
            {points.map((point) => (
              <option key={point.id} value={point.id}>
                {point.name} ({point.unit})
              </option>
            ))}
          </select>
        </label>

        {pointId && (
          <label className="field">
            {c.readingLabel}
            <input type="number" inputMode="decimal" step="0.01" value={reading} onChange={(e) => setReading(e.target.value)} />
          </label>
        )}

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
