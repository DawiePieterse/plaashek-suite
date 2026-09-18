import { useState } from "react";

export interface CatalogItem {
  id: string;
  name: string;
  unit: string;
  active: boolean;
}

/**
 * The catalog shape Stoor and Water both are: a farm-defined list of
 * {name, unit, active} that the office can add to and edit, everyone can
 * read (docs/stoor-build-scope.md, docs/water-build-scope.md). Lifted out
 * once a second module needed the identical table-plus-add-row — the data
 * fetch and the API calls stay in each caller, since the paths and copy
 * differ; only the rendering is shared.
 */
export function CatalogCard({
  heading,
  error,
  emptyText,
  nameLabel,
  unitLabel,
  activeLabel,
  namePlaceholder,
  unitPlaceholder,
  addLabel,
  saveLabel,
  yesLabel,
  noLabel,
  items,
  isAdmin,
  busy,
  onAdd,
  onSave,
}: {
  heading: string;
  error?: string;
  emptyText: string;
  nameLabel: string;
  unitLabel: string;
  activeLabel: string;
  namePlaceholder: string;
  unitPlaceholder: string;
  addLabel: string;
  saveLabel: string;
  yesLabel: string;
  noLabel: string;
  items: CatalogItem[];
  isAdmin: boolean;
  busy: boolean;
  onAdd: (name: string, unit: string) => void;
  onSave: (item: CatalogItem, body: { name: string; unit: string; active: boolean }) => void;
}) {
  const [name, setName] = useState("");
  const [unit, setUnit] = useState("");

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const itemName = name.trim();
    const itemUnit = unit.trim();
    if (!itemName || !itemUnit) return;
    onAdd(itemName, itemUnit);
    setName("");
    setUnit("");
  }

  return (
    <section className="no-print">
      <h2>{heading}</h2>
      {error && <p className="error">{error}</p>}

      <div className="card">
        <table>
          <thead>
            <tr>
              <th>{nameLabel}</th>
              <th>{unitLabel}</th>
              <th>{activeLabel}</th>
              {isAdmin && <th></th>}
            </tr>
          </thead>
          <tbody>
            {items.map((item) =>
              isAdmin ? (
                <EditableCatalogRow
                  key={item.id}
                  item={item}
                  busy={busy}
                  nameLabel={nameLabel}
                  unitLabel={unitLabel}
                  activeLabel={activeLabel}
                  saveLabel={saveLabel}
                  onSave={(body) => onSave(item, body)}
                />
              ) : (
                <tr key={item.id}>
                  <td>{item.name}</td>
                  <td>{item.unit}</td>
                  <td>{item.active ? yesLabel : noLabel}</td>
                </tr>
              ),
            )}
            {items.length === 0 && (
              <tr>
                <td colSpan={isAdmin ? 4 : 3} className="muted">
                  {emptyText}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {isAdmin && (
        <form className="row" onSubmit={submit}>
          <input value={name} onChange={(event) => setName(event.target.value)} placeholder={namePlaceholder} aria-label={nameLabel} />
          <input value={unit} onChange={(event) => setUnit(event.target.value)} placeholder={unitPlaceholder} aria-label={unitLabel} className="short" />
          <button type="submit" disabled={busy}>
            {addLabel}
          </button>
        </form>
      )}
    </section>
  );
}

/** Rename, fix the unit, or retire/decommission an item — nothing here touches captures already made against it. */
function EditableCatalogRow({
  item,
  busy,
  nameLabel,
  unitLabel,
  activeLabel,
  saveLabel,
  onSave,
}: {
  item: CatalogItem;
  busy: boolean;
  nameLabel: string;
  unitLabel: string;
  activeLabel: string;
  saveLabel: string;
  onSave: (body: { name: string; unit: string; active: boolean }) => void;
}) {
  const [name, setName] = useState(item.name);
  const [unit, setUnit] = useState(item.unit);

  const changed = name !== item.name || unit !== item.unit;

  return (
    <tr>
      <td>
        <input value={name} onChange={(event) => setName(event.target.value)} aria-label={nameLabel} />
      </td>
      <td>
        <input value={unit} onChange={(event) => setUnit(event.target.value)} aria-label={unitLabel} className="short" />
      </td>
      <td>
        <input
          className="switch"
          type="checkbox"
          checked={item.active}
          disabled={busy}
          aria-label={activeLabel}
          onChange={(event) => onSave({ name, unit, active: event.target.checked })}
        />
      </td>
      <td>
        <button type="button" className="quiet" disabled={busy || !changed} onClick={() => onSave({ name, unit, active: item.active })}>
          {saveLabel}
        </button>
      </td>
    </tr>
  );
}
