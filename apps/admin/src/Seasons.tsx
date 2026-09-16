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

      <ul className="seasons">
        {seasons.map((season) => (
          <li key={season.id}>
            <SeasonForm
              season={season}
              busy={busy}
              readOnly={!isAdmin}
              onSave={(body) => run(() => api(`/seasons/${season.id}`, { method: "PATCH", token: session.token, body: JSON.stringify(body) }))}
              onActivate={() =>
                run(() => api(`/seasons/${season.id}`, { method: "PATCH", token: session.token, body: JSON.stringify({ isActive: true }) }))
              }
            />
          </li>
        ))}
      </ul>

      {isAdmin && (
        <SeasonForm
          busy={busy}
          onSave={(body) => run(() => api("/seasons", { method: "POST", token: session.token, body: JSON.stringify(body) }))}
        />
      )}
    </section>
  );
}

function SeasonForm({
  season,
  busy,
  readOnly,
  onSave,
  onActivate,
}: {
  season?: Season;
  busy: boolean;
  readOnly?: boolean;
  onSave: (body: { name: string; startsOn: string; endsOn: string }) => void;
  onActivate?: () => void;
}) {
  const [name, setName] = useState(season?.name ?? "");
  const [startsOn, setStartsOn] = useState(season?.startsOn ?? "");
  const [endsOn, setEndsOn] = useState(season?.endsOn ?? "");
  const c = t();

  if (readOnly) {
    return (
      <p>
        {season?.name} · {season?.startsOn} – {season?.endsOn} {season?.isActive && <strong>{c.activeSeason}</strong>}
      </p>
    );
  }

  return (
    <form
      className="season"
      onSubmit={(event) => {
        event.preventDefault();
        onSave({ name, startsOn, endsOn });
        if (!season) {
          setName("");
          setStartsOn("");
          setEndsOn("");
        }
      }}
    >
      <label>
        {c.seasonName}
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Oes 2026/27" required />
      </label>

      <label>
        {c.startsOn}
        <input type="date" value={startsOn} onChange={(e) => setStartsOn(e.target.value)} required />
      </label>

      <label>
        {c.endsOn}
        <input type="date" value={endsOn} onChange={(e) => setEndsOn(e.target.value)} required />
      </label>

      <button type="submit" disabled={busy}>
        {season ? c.saveSeason : c.addSeason}
      </button>

      {season &&
        (season.isActive ? (
          <strong>{c.activeSeason}</strong>
        ) : (
          <button type="button" className="link" disabled={busy} onClick={onActivate}>
            {c.makeActive}
          </button>
        ))}
    </form>
  );
}
