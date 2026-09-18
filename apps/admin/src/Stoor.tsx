import { useEffect, useState } from "react";
import { useOffice, useOfficeLoader } from "@plaashek/ui-office";
import { api } from "./api.js";
import { t } from "./copy.js";

interface StockItem {
  id: string;
  name: string;
  unit: string;
  active: boolean;
}

/**
 * Stoor's catalog (docs/stoor-build-scope.md) — add an item, in whatever
 * unit the farm already counts it in, and retire one that is no longer
 * stocked without losing the moves already logged against it. The on-hand
 * numbers are the shared `StockRollup` panel; this is only the catalog.
 */
export function Stoor() {
  const { session } = useOffice();
  const guard = useOfficeLoader();
  const [items, setItems] = useState<StockItem[] | null>(null);
  const [name, setName] = useState("");
  const [unit, setUnit] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const c = t();

  const isAdmin = session.role === "admin";

  async function load() {
    await guard(async () => {
      const { items: fresh } = await api<{ items: StockItem[] }>("/stock-items", { token: session.token });
      setItems(fresh);
    }, setError);
  }

  useEffect(() => {
    void load();
  }, [session.token]);

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    await guard(async () => {
      await action();
      await load();
    }, setError);
    setBusy(false);
  }

  function addItem(event: React.FormEvent) {
    event.preventDefault();
    const itemName = name.trim();
    const itemUnit = unit.trim();
    if (!itemName || !itemUnit) return;

    void run(async () => {
      await api("/stock-items", { method: "POST", token: session.token, body: JSON.stringify({ name: itemName, unit: itemUnit }) });
      setName("");
      setUnit("");
    });
  }

  if (!items) return null;

  return (
    <section className="no-print">
      <h2>{c.stoorCatalogHeading}</h2>
      {error && <p className="error">{error}</p>}

      <div className="card">
        <table>
          <thead>
            <tr>
              <th>{c.itemName}</th>
              <th>{c.itemUnit}</th>
              <th>{c.itemActive}</th>
              {isAdmin && <th></th>}
            </tr>
          </thead>
          <tbody>
            {items.map((item) =>
              isAdmin ? (
                <EditableItemRow
                  key={item.id}
                  item={item}
                  busy={busy}
                  onSave={(body) => run(() => api(`/stock-items/${item.id}`, { method: "PATCH", token: session.token, body: JSON.stringify(body) }))}
                />
              ) : (
                <tr key={item.id}>
                  <td>{item.name}</td>
                  <td>{item.unit}</td>
                  <td>{item.active ? c.yes : c.no}</td>
                </tr>
              ),
            )}
            {items.length === 0 && (
              <tr>
                <td colSpan={isAdmin ? 4 : 3} className="muted">
                  {c.noStockItemsYet}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {isAdmin && (
        <form className="row" onSubmit={addItem}>
          <input value={name} onChange={(event) => setName(event.target.value)} placeholder={c.itemNamePlaceholder} aria-label={c.itemName} />
          <input value={unit} onChange={(event) => setUnit(event.target.value)} placeholder={c.itemUnitPlaceholder} aria-label={c.itemUnit} className="short" />
          <button type="submit" disabled={busy}>
            {c.addItem}
          </button>
        </form>
      )}
    </section>
  );
}

/** Rename, fix the unit, or retire an item — nothing here touches moves already captured. */
function EditableItemRow({
  item,
  busy,
  onSave,
}: {
  item: StockItem;
  busy: boolean;
  onSave: (body: { name: string; unit: string; active: boolean }) => Promise<void>;
}) {
  const [name, setName] = useState(item.name);
  const [unit, setUnit] = useState(item.unit);
  const c = t();

  const changed = name !== item.name || unit !== item.unit;

  return (
    <tr>
      <td>
        <input value={name} onChange={(event) => setName(event.target.value)} aria-label={c.itemName} />
      </td>
      <td>
        <input value={unit} onChange={(event) => setUnit(event.target.value)} aria-label={c.itemUnit} className="short" />
      </td>
      <td>
        <input
          className="switch"
          type="checkbox"
          checked={item.active}
          disabled={busy}
          aria-label={c.itemActive}
          onChange={(event) => void onSave({ name, unit, active: event.target.checked })}
        />
      </td>
      <td>
        <button type="button" className="quiet" disabled={busy || !changed} onClick={() => void onSave({ name, unit, active: item.active })}>
          {c.saveItem}
        </button>
      </td>
    </tr>
  );
}
