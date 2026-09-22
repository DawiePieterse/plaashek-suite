import { useState } from "react";
import { useOffice, useOfficeLoader } from "@plaashek/ui-office";
import { api } from "./api.js";
import { t } from "./copy.js";

/**
 * Where the farm is, for the weather line in the band and the weather stamp
 * on captures. One point per farm is enough — Open-Meteo's grid is coarser
 * than any farm. There is no in-app map: "pick on map" opens Google Maps in
 * a new tab, where a right-click puts the coordinates on the clipboard, and
 * an office computer standing on the farm can use its own location instead.
 */
export function Coordinates() {
  const { session, context, refreshFarm } = useOffice();
  const guard = useOfficeLoader();
  const c = t();

  const stored = context.farm.coords;
  const [lat, setLat] = useState(stored ? String(stored.lat) : "");
  const [lon, setLon] = useState(stored ? String(stored.lon) : "");
  const [busy, setBusy] = useState(false);
  const [locating, setLocating] = useState(false);
  /** One slot for whatever the form last had to say — saving cleared it, an error replaced it. */
  const [note, setNote] = useState<{ kind: "saved" | "error"; text: string } | null>(null);

  if (session.role !== "admin") return null;

  const parsed = { lat: Number(lat), lon: Number(lon) };
  const valid =
    lat.trim() !== "" &&
    lon.trim() !== "" &&
    Number.isFinite(parsed.lat) &&
    Number.isFinite(parsed.lon) &&
    Math.abs(parsed.lat) <= 90 &&
    Math.abs(parsed.lon) <= 180;

  // A set pin opens on the pin; an empty form opens on the farm's part of the world to go find it.
  const mapUrl = valid ? `https://www.google.com/maps?q=${parsed.lat},${parsed.lon}` : "https://www.google.com/maps";

  function edit(setter: (value: string) => void) {
    return (event: React.ChangeEvent<HTMLInputElement>) => {
      setter(event.target.value);
      setNote(null);
    };
  }

  function useMyLocation() {
    setLocating(true);
    setNote(null);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLat(position.coords.latitude.toFixed(6));
        setLon(position.coords.longitude.toFixed(6));
        setLocating(false);
      },
      () => {
        setNote({ kind: "error", text: c.locationFailed });
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  // Submit is unreachable while `valid` is false (the button is disabled), so there is no invalid-input path here.
  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setNote(null);
    await guard(
      async () => {
        await api("/farm/coordinates", {
          method: "PUT",
          token: session.token,
          body: JSON.stringify(parsed),
        });
        // The shell reads the coords off /farm — refreshing it is what makes the weather line appear.
        await refreshFarm();
        setNote({ kind: "saved", text: c.coordsSaved });
      },
      (text) => setNote({ kind: "error", text }),
    );
    setBusy(false);
  }

  return (
    <section>
      <form className="card" onSubmit={save}>
        <h3>{c.coordsHeading}</h3>
        <div className="fields-row">
          <label>
            {c.latitude}
            <input inputMode="decimal" value={lat} onChange={edit(setLat)} placeholder="-25.569853" />
          </label>
          <label>
            {c.longitude}
            <input inputMode="decimal" value={lon} onChange={edit(setLon)} placeholder="31.605606" />
          </label>
        </div>
        <div className="fields">
          <p className="muted coords-note">
            {c.coordsNote}{" "}
            <a href={mapUrl} target="_blank" rel="noreferrer" title={c.pickOnMapHint}>
              {c.pickOnMap}
            </a>
          </p>
          <div className="row">
            <button type="button" className="quiet" onClick={useMyLocation} disabled={locating}>
              {locating ? c.locating : c.useMyLocation}
            </button>
            <button type="submit" disabled={busy || !valid}>
              {c.saveCoords}
            </button>
            {note?.kind === "saved" && <span className="pill on">{note.text}</span>}
          </div>
          {note?.kind === "error" && <p className="error">{note.text}</p>}
        </div>
      </form>
    </section>
  );
}
