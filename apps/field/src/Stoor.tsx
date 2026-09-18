import { useEffect, useState } from "react";
import { useFlush, useSavedToast } from "./capture.js";
import { t } from "./copy.js";
import { enqueue } from "./queue.js";
import { readStored, writeStored } from "./storage.js";
import { fetchBlocks, fetchStockItems, type Claims } from "./ticket.js";

interface Item {
  id: string;
  name: string;
  unit: string;
}

interface Block {
  id: string;
  name: string;
}

const ITEMS_KEY = "plaashek.field.stock-items";
const BLOCKS_KEY = "plaashek.field.stoor.blocks";

/**
 * Stoor capture (docs/stoor-build-scope.md): an item, a direction, and how
 * much. No weather and no GPS — a stock move is not an observation of the
 * kind the other screens stamp. A block only shows up on a `used` move,
 * and even then it is optional (plan §8).
 */
export function Stoor({ ticket, claims }: { ticket: string; claims: Claims }) {
  const [items, setItems] = useState<Item[]>(() => readStored<Item[]>(ITEMS_KEY, []));
  const [blocks, setBlocks] = useState<Block[]>(() => readStored<Block[]>(BLOCKS_KEY, []));
  const [itemId, setItemId] = useState("");
  const [direction, setDirection] = useState<"in" | "out">("in");
  const [quantity, setQuantity] = useState("");
  const [blockId, setBlockId] = useState("");
  const [note, setNote] = useState("");
  const [saved, markSaved] = useSavedToast();
  const { pending, setPending, refused, flush } = useFlush(ticket, t().errors);
  const c = t();

  useEffect(() => {
    fetchStockItems(ticket)
      .then(({ items: fresh }) => {
        setItems(fresh);
        writeStored(ITEMS_KEY, fresh);
      })
      .catch(() => {}); // offline — the cached list stands

    fetchBlocks(ticket)
      .then(({ blocks: fresh }) => {
        setBlocks(fresh);
        writeStored(BLOCKS_KEY, fresh);
      })
      .catch(() => {});
  }, [ticket]);

  function save(event: React.FormEvent) {
    event.preventDefault();

    setPending(
      enqueue({
        entity: "stock_moves",
        entity_id: crypto.randomUUID(),
        client_time: new Date().toISOString(),
        season_id: claims.seasonId,
        payload: {
          item_id: itemId,
          direction,
          quantity: Number(quantity),
          block_id: direction === "out" && blockId ? blockId : null,
          note: note.trim() || null,
        },
      }).length,
    );
    setQuantity("");
    setBlockId("");
    setNote("");
    markSaved();
    navigator.vibrate?.(60);
    void flush();
  }

  return (
    <main>
      <div className="toggle">
        <button type="button" className={direction === "in" ? "on" : ""} onClick={() => setDirection("in")}>
          {c.stockIn}
        </button>
        <button type="button" className={direction === "out" ? "on" : ""} onClick={() => setDirection("out")}>
          {c.stockOut}
        </button>
      </div>

      <form onSubmit={save}>
        <label className="field">
          {c.stockItemLabel}
          <select value={itemId} onChange={(e) => setItemId(e.target.value)} required autoFocus>
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

        <label className="field">
          {c.quantityLabel}
          <input type="number" inputMode="decimal" min="0" step="0.01" value={quantity} onChange={(e) => setQuantity(e.target.value)} required />
        </label>

        {direction === "out" && (
          <label className="field">
            {c.blockLabel}
            <select value={blockId} onChange={(e) => setBlockId(e.target.value)}>
              <option value="">{c.chooseBlock}</option>
              {blocks.map((block) => (
                <option key={block.id} value={block.id}>
                  {block.name}
                </option>
              ))}
            </select>
          </label>
        )}

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
