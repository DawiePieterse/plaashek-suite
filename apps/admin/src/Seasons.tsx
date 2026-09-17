import { useEffect, useState } from "react";
import { api, ApiError, type Session } from "./api.js";
import { t } from "./copy.js";

interface Season {
  id: string;
  name: string;
  startsOn: string;
  endsOn: string;
  isActive: boolean;
}

/**
 * Farm-owned master data (plan §4.2). One active at a time — the server stands
 * the old one down — and everything stays editable, because a pick runs late.
 */
export function Seasons({ session, onSessionExpired }: { session: Session; onSessionExpired: () => void }) {
  const [seasons, setSeasons] = useState<Season[] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const c = t();

  const isAdmin = session.role === "admin";

  async function load() {
    try {
      setSeasons((await api<{ seasons: Season[] }>("/seasons", { token: session.token })).seasons);
    } catch (caught) {
      if (caught instanceof ApiError && caught.code === "unauthenticated") return onSessionExpired();
      setError(caught instanceof ApiError ? caught.message : c.offline);
    }
  }

  useEffect(() => {
    void load();
  }, [session.token]);

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await action();
      await load();
    } catch (caught) {
      if (caught instanceof ApiError && caught.code === "unauthenticated") return onSessionExpired();
      setError(caught instanceof ApiError ? caught.message : c.offline);
    } finally {
      setBusy(false);
    }
  }

  if (!seasons) return null;

  return (
    <section className="no-print">
      <h2>{c.seasonsHeading}</h2>

      {error && <p className="error">{error}</p>}
      {seasons.length === 0 && <p className="muted">{c.noSeasons}</p>}

      {(seasons.length > 0 || isAdmin) && (
        <table className="seasons-table">
          <thead>
            <tr>
              <th>{c.seasonName}</th>
              <th>{c.startsOn}</th>
              <th>{c.endsOn}</th>
              <th>{c.activeSeason}</th>
              {isAdmin && <th></th>}
            </tr>
          </thead>
          <tbody>
            {seasons.map((season) =>
              isAdmin ? (
                <EditableSeasonRow
                  key={season.id}
                  season={season}
                  busy={busy}
                  onSave={(body) => run(() => api(`/seasons/${season.id}`, { method: "PATCH", token: session.token, body: JSON.stringify(body) }))}
                  onActivate={() =>
                    run(() => api(`/seasons/${season.id}`, { method: "PATCH", token: session.token, body: JSON.stringify({ isActive: true }) }))
                  }
                />
              ) : (
                <tr key={season.id}>
                  <td>{season.name}</td>
                  <td>{season.startsOn}</td>
                  <td>{season.endsOn}</td>
                  <td>
                    <input type="checkbox" checked={season.isActive} disabled />
                  </td>
                </tr>
              ),
            )}

            {isAdmin && (
              <NewSeasonRow busy={busy} onCreate={(body) => run(() => api("/seasons", { method: "POST", token: session.token, body: JSON.stringify(body) }))} />
            )}
          </tbody>
        </table>
      )}
    </section>
  );
}

function EditableSeasonRow({
  season,
  busy,
  onSave,
  onActivate,
}: {
  season: Season;
  busy: boolean;
  onSave: (body: { name: string; startsOn: string; endsOn: string }) => void;
  onActivate: () => void;
}) {
  const [name, setName] = useState(season.name);
  const [startsOn, setStartsOn] = useState(season.startsOn);
  const [endsOn, setEndsOn] = useState(season.endsOn);
  const c = t();

  return (
    <tr>
      <td>
        <input value={name} onChange={(e) => setName(e.target.value)} required />
      </td>
      <td>
        <input type="date" value={startsOn} onChange={(e) => setStartsOn(e.target.value)} required />
      </td>
      <td>
        <input type="date" value={endsOn} onChange={(e) => setEndsOn(e.target.value)} required />
      </td>
      <td>
        <input type="checkbox" checked={season.isActive} disabled={busy || season.isActive} onChange={onActivate} />
      </td>
      <td>
        <button type="button" disabled={busy} onClick={() => onSave({ name, startsOn, endsOn })}>
          {c.saveSeason}
        </button>
      </td>
    </tr>
  );
}

function NewSeasonRow({ busy, onCreate }: { busy: boolean; onCreate: (body: { name: string; startsOn: string; endsOn: string }) => void }) {
  const [name, setName] = useState("");
  const [startsOn, setStartsOn] = useState("");
  const [endsOn, setEndsOn] = useState("");
  const c = t();

  function submit() {
    onCreate({ name, startsOn, endsOn });
    setName("");
    setStartsOn("");
    setEndsOn("");
  }

  return (
    <tr>
      <td>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Oes 2026/27" />
      </td>
      <td>
        <input type="date" value={startsOn} onChange={(e) => setStartsOn(e.target.value)} />
      </td>
      <td>
        <input type="date" value={endsOn} onChange={(e) => setEndsOn(e.target.value)} />
      </td>
      <td></td>
      <td>
        <button type="button" disabled={busy || !name || !startsOn || !endsOn} onClick={submit}>
          {c.addSeason}
        </button>
      </td>
    </tr>
  );
}
