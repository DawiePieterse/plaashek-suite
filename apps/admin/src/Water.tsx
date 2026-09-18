import { useEffect, useState } from "react";
import { useOffice, useOfficeLoader } from "@plaashek/ui-office";
import { api } from "./api.js";
import { t } from "./copy.js";

interface WaterPoint {
  id: string;
  name: string;
  unit: string;
  active: boolean;
}

/**
 * Water's catalog (docs/water-build-scope.md) — add a point, in whatever
 * unit the farm already reads it in, and decommission one that no longer
 * exists without losing the readings already logged against it. The
 * latest-reading-plus-delta numbers are the shared `WaterRollup` panel;
 * this is only the catalog.
 */
export function Water() {
  const { session } = useOffice();
  const guard = useOfficeLoader();
  const [points, setPoints] = useState<WaterPoint[] | null>(null);
  const [name, setName] = useState("");
  const [unit, setUnit] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const c = t();

  const isAdmin = session.role === "admin";

  async function load() {
    await guard(async () => {
      const { points: fresh } = await api<{ points: WaterPoint[] }>("/water-points", { token: session.token });
      setPoints(fresh);
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

  function addPoint(event: React.FormEvent) {
    event.preventDefault();
    const pointName = name.trim();
    const pointUnit = unit.trim();
    if (!pointName || !pointUnit) return;

    void run(async () => {
      await api("/water-points", { method: "POST", token: session.token, body: JSON.stringify({ name: pointName, unit: pointUnit }) });
      setName("");
      setUnit("");
    });
  }

  if (!points) return null;

  return (
    <section className="no-print">
      <h2>{c.waterPointsHeading}</h2>
      {error && <p className="error">{error}</p>}

      <div className="card">
        <table>
          <thead>
            <tr>
              <th>{c.point}</th>
              <th>{c.unit}</th>
              <th>{c.itemActive}</th>
              {isAdmin && <th></th>}
            </tr>
          </thead>
          <tbody>
            {points.map((point) =>
              isAdmin ? (
                <EditablePointRow
                  key={point.id}
                  point={point}
                  busy={busy}
                  onSave={(body) => run(() => api(`/water-points/${point.id}`, { method: "PATCH", token: session.token, body: JSON.stringify(body) }))}
                />
              ) : (
                <tr key={point.id}>
                  <td>{point.name}</td>
                  <td>{point.unit}</td>
                  <td>{point.active ? c.yes : c.no}</td>
                </tr>
              ),
            )}
            {points.length === 0 && (
              <tr>
                <td colSpan={isAdmin ? 4 : 3} className="muted">
                  {c.noWaterPointsYet}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {isAdmin && (
        <form className="row" onSubmit={addPoint}>
          <input value={name} onChange={(event) => setName(event.target.value)} placeholder={c.pointNamePlaceholder} aria-label={c.point} />
          <input value={unit} onChange={(event) => setUnit(event.target.value)} placeholder={c.pointUnitPlaceholder} aria-label={c.unit} className="short" />
          <button type="submit" disabled={busy}>
            {c.addPoint}
          </button>
        </form>
      )}
    </section>
  );
}

/** Rename, fix the unit, or decommission a point — nothing here touches readings already captured. */
function EditablePointRow({
  point,
  busy,
  onSave,
}: {
  point: WaterPoint;
  busy: boolean;
  onSave: (body: { name: string; unit: string; active: boolean }) => Promise<void>;
}) {
  const [name, setName] = useState(point.name);
  const [unit, setUnit] = useState(point.unit);
  const c = t();

  const changed = name !== point.name || unit !== point.unit;

  return (
    <tr>
      <td>
        <input value={name} onChange={(event) => setName(event.target.value)} aria-label={c.point} />
      </td>
      <td>
        <input value={unit} onChange={(event) => setUnit(event.target.value)} aria-label={c.unit} className="short" />
      </td>
      <td>
        <input
          className="switch"
          type="checkbox"
          checked={point.active}
          disabled={busy}
          aria-label={c.itemActive}
          onChange={(event) => void onSave({ name, unit, active: event.target.checked })}
        />
      </td>
      <td>
        <button type="button" className="quiet" disabled={busy || !changed} onClick={() => void onSave({ name, unit, active: point.active })}>
          {c.saveItem}
        </button>
      </td>
    </tr>
  );
}
