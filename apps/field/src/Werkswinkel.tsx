import { useEffect, useState } from "react";
import { useFlush, useSavedToast } from "./capture.js";
import { t } from "./copy.js";
import { enqueue } from "./queue.js";
import { readStored, writeStored } from "./storage.js";
import { fetchAssets, fetchOpenJobs, type Claims } from "./ticket.js";

interface Asset {
  id: string;
  name: string;
}

interface OpenJob {
  assetId: string;
  assetName: string;
  description: string | null;
  openedAt: string;
}

type Action = "fuel" | "open" | "close";

const ASSETS_KEY = "plaashek.field.assets";
const OPEN_JOBS_KEY = "plaashek.field.open-jobs";

/**
 * Werkswinkel capture (docs/werkswinkel-build-scope.md): one asset picker,
 * then one of three small forms. No GPS, no weather, no season — a job or a
 * fill-up is about the asset, not a place or a crop observation.
 */
export function Werkswinkel({ ticket, claims }: { ticket: string; claims: Claims }) {
  const [assets, setAssets] = useState<Asset[]>(() => readStored<Asset[]>(ASSETS_KEY, []));
  const [openJobs, setOpenJobs] = useState<OpenJob[]>(() => readStored<OpenJob[]>(OPEN_JOBS_KEY, []));
  const [assetId, setAssetId] = useState("");
  const [action, setAction] = useState<Action>("fuel");
  const [litres, setLitres] = useState("");
  const [meterReading, setMeterReading] = useState("");
  const [description, setDescription] = useState("");
  const [note, setNote] = useState("");
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

    // Cached the same way: a job closed on a different phone since the last
    // fetch still shows here until the next signal, which only means a
    // `closed` sent against it lands on an already-closed job and is ignored.
    fetchOpenJobs(ticket)
      .then(({ jobs: fresh }) => {
        setOpenJobs(fresh);
        writeStored(OPEN_JOBS_KEY, fresh);
      })
      .catch(() => {});
  }, [ticket]);

  const assetOpenJobs = openJobs.filter((job) => job.assetId === assetId);

  function save(event: React.FormEvent) {
    event.preventDefault();
    if (!assetId) return;

    if (action === "fuel") {
      setPending(
        enqueue({
          entity: "fuel_logs",
          entity_id: crypto.randomUUID(),
          client_time: new Date().toISOString(),
          season_id: null,
          payload: {
            asset_id: assetId,
            litres: Number(litres),
            meter_reading: meterReading ? Number(meterReading) : null,
            note: note.trim() || null,
          },
        }).length,
      );
      setLitres("");
      setMeterReading("");
    } else {
      setPending(
        enqueue({
          entity: "work_orders",
          entity_id: crypto.randomUUID(),
          client_time: new Date().toISOString(),
          season_id: null,
          payload: {
            asset_id: assetId,
            event: action === "open" ? "opened" : "closed",
            description: action === "open" ? description.trim() || null : note.trim() || null,
          },
        }).length,
      );
      setDescription("");
    }
    setNote("");
    markSaved();
    navigator.vibrate?.(60);
    void flush();
  }

  return (
    <main>
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

      {assets.length === 0 && <p className="refused">{c.noAssetsFound}</p>}

      {assetId && (
        <>
          <div className="toggle">
            <button type="button" className={action === "fuel" ? "on" : ""} onClick={() => setAction("fuel")}>
              {c.logFuel}
            </button>
            <button type="button" className={action === "open" ? "on" : ""} onClick={() => setAction("open")}>
              {c.openJob}
            </button>
            <button type="button" className={action === "close" ? "on" : ""} disabled={assetOpenJobs.length === 0} onClick={() => setAction("close")}>
              {c.closeJob}
            </button>
          </div>

          <form onSubmit={save}>
            {action === "fuel" && (
              <>
                <label className="field">
                  {c.litresLabel}
                  <input type="number" inputMode="decimal" min="0" step="0.1" value={litres} onChange={(e) => setLitres(e.target.value)} required />
                </label>
                <label className="field">
                  {c.meterReadingLabelOptional}
                  <input type="number" inputMode="decimal" step="0.01" value={meterReading} onChange={(e) => setMeterReading(e.target.value)} />
                </label>
                <label className="field">
                  {c.noteLabelOptional}
                  <input type="text" value={note} onChange={(e) => setNote(e.target.value)} />
                </label>
              </>
            )}

            {action === "open" && (
              <label className="field">
                {c.faultLabel}
                <input type="text" value={description} onChange={(e) => setDescription(e.target.value)} required />
              </label>
            )}

            {action === "close" && (
              <>
                <p className="status">{c.openJobsCount(assetOpenJobs.length)}</p>
                <ul>
                  {assetOpenJobs.map((job, index) => (
                    <li key={index}>{job.description || c.noDescription}</li>
                  ))}
                </ul>
                <label className="field">
                  {c.doneLabelOptional}
                  <input type="text" value={note} onChange={(e) => setNote(e.target.value)} />
                </label>
              </>
            )}

            <button type="submit">{c.save}</button>
          </form>
        </>
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
