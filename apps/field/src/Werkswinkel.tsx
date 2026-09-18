import { useEffect, useState } from "react";
import { useFlush, useSavedToast } from "./capture.js";
import { t } from "./copy.js";
import { enqueue } from "./queue.js";
import { readStored, writeStored } from "./storage.js";
import { fetchAssets, type Claims } from "./ticket.js";

interface Asset {
  id: string;
  name: string;
}

const ASSETS_KEY = "plaashek.field.assets";

/**
 * Werkswinkel capture (docs/werkswinkel-build-scope.md): one screen, a kind
 * switch (fuel / issue) at the top. Both "report" and "resolve" are always
 * offered for any asset — the phone never tries to know whether an asset
 * already has an open issue (ADR 0014, same "no enforcement" call as Span).
 */
export function Werkswinkel({ ticket, claims }: { ticket: string; claims: Claims }) {
  const [assets, setAssets] = useState<Asset[]>(() => readStored<Asset[]>(ASSETS_KEY, []));
  const [kind, setKind] = useState<"fuel" | "issue">("fuel");
  const [assetId, setAssetId] = useState("");
  const [litres, setLitres] = useState("");
  const [odometer, setOdometer] = useState("");
  const [description, setDescription] = useState("");
  const [saved, markSaved] = useSavedToast();
  const { pending, setPending, refused, flush } = useFlush(ticket, t().errors);
  const c = t();

  useEffect(() => {
    fetchAssets(ticket)
      .then(({ assets: fresh }) => {
        setAssets(fresh);
        writeStored(ASSETS_KEY, fresh);
      })
      .catch(() => {}); // offline — the cached list stands
  }, [ticket]);

  function saveFuel(event: React.FormEvent) {
    event.preventDefault();

    setPending(
      enqueue({
        entity: "fuel_logs",
        entity_id: crypto.randomUUID(),
        client_time: new Date().toISOString(),
        season_id: claims.seasonId,
        payload: {
          asset_id: assetId,
          litres_used: Number(litres),
          odometer_km: odometer ? Number(odometer) : null,
          note: null,
        },
      }).length,
    );
    setLitres("");
    setOdometer("");
    markSaved();
    navigator.vibrate?.(60);
    void flush();
  }

  function saveWorkOrder(status: "open" | "closed") {
    setPending(
      enqueue({
        entity: "work_orders",
        entity_id: crypto.randomUUID(),
        client_time: new Date().toISOString(),
        season_id: claims.seasonId,
        payload: {
          asset_id: assetId,
          description,
          status,
        },
      }).length,
    );
    setDescription("");
    markSaved();
    navigator.vibrate?.(60);
    void flush();
  }

  return (
    <main>
      <div className="row">
        <button type="button" className={kind === "fuel" ? "on" : "quiet"} onClick={() => setKind("fuel")}>
          {c.fuelKind}
        </button>
        <button type="button" className={kind === "issue" ? "on" : "quiet"} onClick={() => setKind("issue")}>
          {c.issueKind}
        </button>
      </div>

      <label className="field">
        {c.assetLabel}
        <select value={assetId} onChange={(e) => setAssetId(e.target.value)} required autoFocus>
          <option value="" disabled>
            {c.chooseAsset}
          </option>
          {assets.map((asset) => (
            <option key={asset.id} value={asset.id}>
              {asset.name}
            </option>
          ))}
        </select>
      </label>

      {assets.length === 0 && <p className="refused">{c.noAssets}</p>}

      {kind === "fuel" ? (
        <form onSubmit={saveFuel}>
          <label className="field">
            {c.litresLabel}
            <input type="number" inputMode="decimal" min="0" step="0.1" value={litres} onChange={(e) => setLitres(e.target.value)} required />
          </label>

          <label className="field">
            {c.odometerLabel}
            <input type="number" inputMode="decimal" min="0" step="1" value={odometer} onChange={(e) => setOdometer(e.target.value)} />
          </label>

          <button type="submit">{c.save}</button>
        </form>
      ) : (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            saveWorkOrder("open");
          }}
        >
          <label className="field">
            {c.descriptionLabel}
            <input type="text" value={description} onChange={(e) => setDescription(e.target.value)} required />
          </label>

          <div className="row">
            <button type="submit">{c.reportIssue}</button>
            <button type="button" className="quiet" disabled={!assetId || !description} onClick={() => saveWorkOrder("closed")}>
              {c.markResolved}
            </button>
          </div>
        </form>
      )}

      {saved && <p className="saved toast">{c.savedOnPhone}</p>}
      {refused && <p className="refused">{refused}</p>}

      <footer>
        {pending > 0 && <span className="badge">{pending}</span>}
        {pending > 0 ? c.waitingToSend(pending) : c.allSent}
      </footer>
    </main>
  );
}
