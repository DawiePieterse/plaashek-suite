import { useEffect, useState } from "react";
import { api, ApiError, OFFLINE_MESSAGE, type Farm, type Session } from "./api.js";

/** The modules actually built so far (plan §4.5, §12) — anything else is typed in by hand. */
const BUILT_MODULES = ["veldnotas", "boord", "eienaar"];

const LANGUAGE_NAME: Record<string, string> = { af: "Afrikaans", en: "English" };

export function Farms({ session, onSessionExpired }: { session: Session; onSessionExpired: () => void }) {
  const [farms, setFarms] = useState<Farm[] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

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

  if (!farms) return null;

  return (
    <section>
      <h2>Plase</h2>

      {error && <p className="error">{error}</p>}
      {farms.length === 0 && <p className="muted">Nog geen plaas nie. Skep die eerste een.</p>}

      {farms.length > 0 && (
        <table className="farms-table">
          <thead>
            <tr>
              <th>Plaas</th>
              <th>Organisasie</th>
              <th>Taal</th>
              <th>Demo?</th>
              {BUILT_MODULES.map((code) => (
                <th key={code}>{code}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {farms.map((f) => {
              const statusByModule = new Map(f.entitlements.map((e) => [e.moduleCode, e.status]));
              const licensed = (code: string) => statusByModule.get(code) === "active" || statusByModule.get(code) === "grace";

              return (
                <tr key={f.farm.id}>
                  <td>{f.farm.name}</td>
                  <td>{f.organisation.name}</td>
                  <td>{LANGUAGE_NAME[f.farm.language] ?? f.farm.language}</td>
                  {/* No is-demo column in the schema — the seed script always creates demo farms under this org name, so that's the tell. */}
                  <td>{f.organisation.name === "Demo Organisasie" ? "Ja" : "Nee"}</td>
                  {BUILT_MODULES.map((code) => (
                    <td key={code}>
                      <input
                        type="checkbox"
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

      <CreateFarmForm busy={busy} onCreate={(body) => run(() => api("/management/farms", { method: "POST", token: session.token, body: JSON.stringify(body) }))} />
    </section>
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
      className="create-farm"
      onSubmit={(event) => {
        event.preventDefault();
        onCreate({ organisationName, farmName, language });
        setOrganisationName("");
        setFarmName("");
        setLanguage("af");
      }}
    >
      <h3>Nuwe plaas</h3>

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
    </form>
  );
}
