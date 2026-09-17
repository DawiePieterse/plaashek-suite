import { useEffect, useState } from "react";
import { api, ApiError, OFFLINE_MESSAGE, type Farm, type Session } from "./api.js";

/** The modules actually built so far (plan §4.5, §12) — anything else is typed in by hand. */
const BUILT_MODULES = ["veldnotas", "boord", "eienaar"];

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

      <ul className="farms">
        {farms.map((f) => (
          <li key={f.farm.id}>
            <FarmCard farm={f} busy={busy} onSetEntitlement={(moduleCode, status) => run(() => setEntitlement(session, f.farm.id, moduleCode, status))} />
          </li>
        ))}
      </ul>

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

function FarmCard({
  farm,
  busy,
  onSetEntitlement,
}: {
  farm: Farm;
  busy: boolean;
  onSetEntitlement: (moduleCode: string, status: "active" | "cancelled") => void;
}) {
  const [customModule, setCustomModule] = useState("");
  const statusByModule = new Map(farm.entitlements.map((e) => [e.moduleCode, e.status]));
  const licensed = (code: string) => statusByModule.get(code) === "active" || statusByModule.get(code) === "grace";

  return (
    <div className="farm-card">
      <div className="farm-head">
        <strong>{farm.farm.name}</strong>
        <span className="muted">
          {farm.organisation.name} · {farm.farm.language}
        </span>
      </div>

      <div className="modules">
        {BUILT_MODULES.map((code) => (
          <label key={code} className="module-toggle">
            <input
              type="checkbox"
              checked={licensed(code)}
              disabled={busy}
              onChange={(e) => onSetEntitlement(code, e.target.checked ? "active" : "cancelled")}
            />
            {code}
          </label>
        ))}

        {farm.entitlements
          .filter((e) => !BUILT_MODULES.includes(e.moduleCode))
          .map((e) => (
            <label key={e.moduleCode} className="module-toggle">
              <input
                type="checkbox"
                checked={e.status === "active" || e.status === "grace"}
                disabled={busy}
                onChange={(ev) => onSetEntitlement(e.moduleCode, ev.target.checked ? "active" : "cancelled")}
              />
              {e.moduleCode}
            </label>
          ))}
      </div>

      <form
        className="add-module"
        onSubmit={(event) => {
          event.preventDefault();
          if (!customModule.trim()) return;
          onSetEntitlement(customModule.trim(), "active");
          setCustomModule("");
        }}
      >
        <input
          value={customModule}
          onChange={(e) => setCustomModule(e.target.value)}
          placeholder="ander program (bv. kudde, custom:x)"
        />
        <button type="submit" disabled={busy}>
          Voeg by
        </button>
      </form>
    </div>
  );
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
