import { useEffect, useState } from "react";
import { api, ApiError, OFFLINE_MESSAGE, type Farm, type Session } from "./api.js";

/** The modules actually built so far (plan §4.5, §11, §12) — anything else is typed in by hand. */
const BUILT_MODULES = ["veldnotas", "boord", "eienaar", "span", "stoor", "water", "werkswinkel", "bespuiting"];

const LANGUAGE_NAME: Record<string, string> = { af: "Afrikaans", en: "English" };

export function Farms({ session, onSessionExpired }: { session: Session; onSessionExpired: () => void }) {
  const [farms, setFarms] = useState<Farm[] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState("");

  async function load() {
    try {
      setFarms((await api<{ farms: Farm[] }>("/management/farms", { token: session.token })).farms);
    } catch (caught) {
      if (caught instanceof ApiError && caught.code === "unauthenticated") return onSessionExpired();
      setError(caught instanceof ApiError ? caught.message : OFFLINE_MESSAGE);
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
      setError(caught instanceof ApiError ? caught.message : OFFLINE_MESSAGE);
    } finally {
      setBusy(false);
    }
  }

  if (!farms) return <p className="empty">Laai…</p>;

  const needle = query.trim().toLowerCase();
  const shown = needle ? farms.filter((f) => `${f.farm.name} ${f.organisation.name}`.toLowerCase().includes(needle)) : farms;

  return (
    <>
      <div className="section-head">
        <h2>Plase</h2>
        <span className="pill">{farms.length}</span>
        {farms.length > 0 && (
          <input className="search" type="search" placeholder="Soek plaas of organisasie…" value={query} onChange={(e) => setQuery(e.target.value)} />
        )}
      </div>

      {error && <p className="error">{error}</p>}

      <div className="card">
        {shown.length === 0 ? (
          <p className="empty">{farms.length === 0 ? "Nog geen plaas nie. Skep die eerste een hieronder." : "Geen plaas pas by die soektog nie."}</p>
        ) : (
          <table className="farms-table">
            <thead>
              <tr>
                <th>Plaas</th>
                <th>Taal</th>
                <th>Demo</th>
                {BUILT_MODULES.map((code) => (
                  <th key={code}>{code}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.map((f) => {
                const statusByModule = new Map(f.entitlements.map((e) => [e.moduleCode, e.status]));
                const licensed = (code: string) => statusByModule.get(code) === "active" || statusByModule.get(code) === "grace";

                return (
                  <tr key={f.farm.id}>
                    <td className="farm-name">
                      {f.farm.name}
                      <span className="farm-org">{f.organisation.name}</span>
                    </td>
                    <td>{LANGUAGE_NAME[f.farm.language] ?? f.farm.language}</td>
                    {/* No is-demo column in the schema — the seed script always creates demo farms under this org name, so that's the tell. Read-only: nothing to set. */}
                    <td>
                      <input className="switch" type="checkbox" checked={f.organisation.name === "Demo Organisasie"} disabled aria-label="Demo" />
                    </td>
                    {BUILT_MODULES.map((code) => (
                      <td key={code}>
                        <input
                          className="switch"
                          type="checkbox"
                          aria-label={`${code} vir ${f.farm.name}`}
                          checked={licensed(code)}
                          disabled={busy}
                          onChange={(e) => run(() => setEntitlement(session, f.farm.id, code, e.target.checked ? "active" : "cancelled"))}
                        />
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <div className="forms">
        <CreateFarmForm busy={busy} onCreate={(body) => run(() => api("/management/farms", { method: "POST", token: session.token, body: JSON.stringify(body) }))} />

        {farms.length > 0 && (
          <CreateLoginForm
            farms={farms}
            busy={busy}
            onCreate={(farmId, body) => run(() => api(`/management/farms/${farmId}/logins`, { method: "POST", token: session.token, body: JSON.stringify(body) }))}
          />
        )}
      </div>
    </>
  );
}

function setEntitlement(session: Session, farmId: string, moduleCode: string, status: string) {
  return api(`/management/farms/${farmId}/entitlements`, {
    method: "PUT",
    token: session.token,
    body: JSON.stringify({ moduleCode, status }),
  });
}

function CreateFarmForm({ busy, onCreate }: { busy: boolean; onCreate: (body: { organisationName: string; farmName: string; language: "af" | "en" }) => void }) {
  const [organisationName, setOrganisationName] = useState("");
  const [farmName, setFarmName] = useState("");
  const [language, setLanguage] = useState<"af" | "en">("af");

  return (
    <form
      className="card"
      onSubmit={(event) => {
        event.preventDefault();
        onCreate({ organisationName, farmName, language });
        setOrganisationName("");
        setFarmName("");
        setLanguage("af");
      }}
    >
      <h3>Nuwe plaas</h3>

      <div className="fields">
        <label>
          Organisasie
          <input value={organisationName} onChange={(e) => setOrganisationName(e.target.value)} required />
        </label>

        <label>
          Plaasnaam
          <input value={farmName} onChange={(e) => setFarmName(e.target.value)} required />
        </label>

        <label>
          Taal
          <select value={language} onChange={(e) => setLanguage(e.target.value as "af" | "en")}>
            <option value="af">Afrikaans</option>
            <option value="en">English</option>
          </select>
        </label>

        <button type="submit" disabled={busy}>
          Skep plaas
        </button>
      </div>
    </form>
  );
}

/** Bootstraps a farm's first Farm Admin Tool / Owner Module login — a farm can't self-signup (plan §3.1). */
function CreateLoginForm({
  farms,
  busy,
  onCreate,
}: {
  farms: Farm[];
  busy: boolean;
  onCreate: (farmId: string, body: { personName: string; email: string; password: string; role: "admin" | "owner" }) => void;
}) {
  const [farmId, setFarmId] = useState(farms[0].farm.id);
  const [personName, setPersonName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"admin" | "owner">("admin");

  return (
    <form
      className="card"
      onSubmit={(event) => {
        event.preventDefault();
        onCreate(farmId, { personName, email, password, role });
        setPersonName("");
        setEmail("");
        setPassword("");
      }}
    >
      <h3>Kantoor-aanmelding</h3>

      <div className="fields">
        <label>
          Plaas
          <select value={farmId} onChange={(e) => setFarmId(e.target.value)}>
            {farms.map((f) => (
              <option key={f.farm.id} value={f.farm.id}>
                {f.farm.name}
              </option>
            ))}
          </select>
        </label>

        <label>
          Naam
          <input value={personName} onChange={(e) => setPersonName(e.target.value)} required />
        </label>

        <label>
          E-pos
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>

        <label>
          Wagwoord
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={8} required />
        </label>

        <label>
          Rol
          <select value={role} onChange={(e) => setRole(e.target.value as "admin" | "owner")}>
            <option value="admin">admin</option>
            <option value="owner">owner</option>
          </select>
        </label>

        <button type="submit" disabled={busy}>
          Skep aanmelding
        </button>
      </div>
    </form>
  );
}
