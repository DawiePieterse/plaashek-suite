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
 * Water capture (docs/water-build-scope.md): pick the meter (a farm asset),
 * type the reading, optional note. No GPS, no weather — the asset is the
 * place, not the phone.
 */
export function Water({ ticket, claims }: { ticket: string; claims: Claims }) {
  const [assets, setAssets] = useState<Asset[]>(() => readStored<Asset[]>(ASSETS_KEY, []));
  const [assetId, setAssetId] = useState("");
  const [reading, setReading] = useState("");
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
  }, [ticket]);

  function save(event: React.FormEvent) {
    event.preventDefault();

    setPending(
      enqueue({
        entity: "meter_readings",
        entity_id: crypto.randomUUID(),
        client_time: new Date().toISOString(),
        season_id: claims.seasonId,
        payload: {
          asset_id: assetId,
          reading: Number(reading),
          note: note || null,
        },
      }).length,
    );
    setReading("");
    setNote("");
    markSaved();
    navigator.vibrate?.(60);
    void flush();
  }

  return (
    <main>
      <form onSubmit={save}>
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

        <label className="field">
          {c.readingLabel}
          <input type="number" inputMode="decimal" step="0.01" value={reading} onChange={(e) => setReading(e.target.value)} required />
        </label>

        <label className="field">
          {c.noteOptionalLabel}
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
