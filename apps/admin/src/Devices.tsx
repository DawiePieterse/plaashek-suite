import { useEffect, useState } from "react";
import {
  api,
  ApiError,
  formatWhen,
  moduleName,
  type Device,
  type FarmContext,
  type PairingToken,
  type Session,
} from "./api.js";
import { PairingSlip, type SlipDetails } from "./PairingSlip.js";

export function Devices({ session, onSessionExpired }: { session: Session; onSessionExpired: () => void }) {
  const [context, setContext] = useState<FarmContext | null>(null);
  const [devices, setDevices] = useState<Device[]>([]);
  const [slip, setSlip] = useState<SlipDetails | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const isAdmin = session.role === "admin";

  async function load() {
    try {
      const [farmContext, deviceList] = await Promise.all([
        api<FarmContext>("/farm", { token: session.token }),
        api<{ devices: Device[] }>("/devices", { token: session.token }),
      ]);
      setContext(farmContext);
      setDevices(deviceList.devices);
    } catch (caught) {
      if (caught instanceof ApiError && caught.code === "unauthenticated") return onSessionExpired();
      setError(caught instanceof ApiError ? caught.message : "Kan nie aan die bediener koppel nie.");
    }
  }

  // Keyed on the token only: a new session reloads, a parent re-render does not.
  useEffect(() => {
    void load();
  }, [session.token]);

  /** Every mutation goes through here: one error path, one reload, no half-drawn list. */
  async function run<T>(action: () => Promise<T>, after?: (result: T) => void) {
    setBusy(true);
    setError("");
    try {
      const result = await action();
      after?.(result);
      await load();
    } catch (caught) {
      if (caught instanceof ApiError && caught.code === "unauthenticated") return onSessionExpired();
      setError(caught instanceof ApiError ? caught.message : "Kan nie aan die bediener koppel nie.");
    } finally {
      setBusy(false);
    }
  }

  function showSlip(pairingToken: PairingToken, personName: string) {
    setSlip({ pairingToken, personName, farmName: context?.farm.name ?? "" });
  }

  if (!context) return <p className="muted">Laai…</p>;

  const personName = (device: Device) => device.assignedPerson?.personName ?? "Niemand toegewys nie";

  return (
    <section>
      <h2 className="no-print">Toestelle — {context.farm.name}</h2>

      {error && <p className="error no-print">{error}</p>}

      {isAdmin && (
        <AddDeviceForm
          context={context}
          busy={busy}
          onSubmit={(body) =>
            run(
              () => api<{ pairingToken: PairingToken }>("/devices", { method: "POST", token: session.token, body: JSON.stringify(body) }),
              ({ pairingToken }) => showSlip(pairingToken, context.people.find((p) => p.id === body.personId)?.name ?? ""),
            )
          }
        />
      )}

      {devices.length === 0 && <p className="muted no-print">Nog geen toestelle nie. Voeg die eerste een by.</p>}

      <ul className="devices no-print">
        {devices.map((device) => (
          <li key={device.id}>
            <div className="device-head">
              <strong>{device.label ?? "Toestel sonder naam"}</strong>
              <span className="muted">{personName(device)}</span>
            </div>

            <p>
              Programme: {device.modules.length ? device.modules.map(moduleName).join(", ") : "nog geen — wag vir die eerste skandering"}
            </p>

            {device.pendingPairingTokens.map((pending) => (
              <p key={pending.id} className="pending">
                Wag vir paring: {moduleName(pending.moduleCode)} — gedruk {formatWhen(pending.printedAt)}, verval {formatWhen(pending.expiresAt)}
                {isAdmin && (
                  <>
                    <button
                      type="button"
                      className="link"
                      disabled={busy}
                      onClick={() =>
                        run(
                          () =>
                            api<{ pairingToken: PairingToken }>(`/pairing-tokens/${pending.id}/reprint`, {
                              method: "POST",
                              token: session.token,
                            }),
                          ({ pairingToken }) => showSlip(pairingToken, personName(device)),
                        )
                      }
                    >
                      Herdruk
                    </button>
                    <button
                      type="button"
                      className="link"
                      disabled={busy}
                      onClick={() => run(() => api(`/pairing-tokens/${pending.id}/cancel`, { method: "POST", token: session.token }))}
                    >
                      Kanselleer
                    </button>
                  </>
                )}
              </p>
            ))}

            {isAdmin && (
              <div className="device-actions">
                <AddAppForm
                  device={device}
                  modules={context.modules}
                  busy={busy}
                  onSubmit={(moduleCode) =>
                    run(
                      () =>
                        api<{ pairingToken: PairingToken }>(`/devices/${device.id}/apps`, {
                          method: "POST",
                          token: session.token,
                          body: JSON.stringify({ moduleCode }),
                        }),
                      ({ pairingToken }) => showSlip(pairingToken, personName(device)),
                    )
                  }
                />

                <button
                  type="button"
                  className="danger"
                  disabled={busy}
                  onClick={() => {
                    if (!confirm("Herroep hierdie toestel? Alle programme gaan dood by die volgende sync.")) return;
                    void run(() => api(`/devices/${device.id}/revoke`, { method: "POST", token: session.token }));
                  }}
                >
                  Herroep
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>

      {slip && <PairingSlip slip={slip} onClose={() => setSlip(null)} />}
    </section>
  );
}

function AddDeviceForm({
  context,
  busy,
  onSubmit,
}: {
  context: FarmContext;
  busy: boolean;
  onSubmit: (body: { personId: string; moduleCode: string; label?: string }) => void;
}) {
  const [personId, setPersonId] = useState("");
  const [moduleCode, setModuleCode] = useState("");
  const [label, setLabel] = useState("");

  if (context.modules.length === 0) {
    return <p className="muted no-print">Die plaas het nog geen aktiewe lisensie nie. Kontak Plaashek.</p>;
  }

  return (
    <form
      className="add-device no-print"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit({ personId, moduleCode, ...(label ? { label } : {}) });
        setLabel("");
      }}
    >
      <label>
        Persoon
        <select value={personId} onChange={(e) => setPersonId(e.target.value)} required>
          <option value="">Kies…</option>
          {context.people.map((person) => (
            <option key={person.id} value={person.id}>
              {person.name}
            </option>
          ))}
        </select>
      </label>

      <label>
        Program
        <select value={moduleCode} onChange={(e) => setModuleCode(e.target.value)} required>
          <option value="">Kies…</option>
          {context.modules.map((code) => (
            <option key={code} value={code}>
              {moduleName(code)}
            </option>
          ))}
        </select>
      </label>

      <label>
        Naam (opsioneel)
        <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Pakhuis tablet" />
      </label>

      <button type="submit" disabled={busy}>
        Voeg toestel by en druk QR
      </button>
    </form>
  );
}

function AddAppForm({
  device,
  modules,
  busy,
  onSubmit,
}: {
  device: Device;
  modules: string[];
  busy: boolean;
  onSubmit: (moduleCode: string) => void;
}) {
  const [moduleCode, setModuleCode] = useState("");

  // A module already installed or already waiting for a scan has nothing to add.
  const taken = [...device.modules, ...device.pendingPairingTokens.map((t) => t.moduleCode)];
  const available = modules.filter((code) => !taken.includes(code));
  if (available.length === 0) return null;

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit(moduleCode);
        setModuleCode("");
      }}
    >
      <select value={moduleCode} onChange={(e) => setModuleCode(e.target.value)} required>
        <option value="">Voeg program by…</option>
        {available.map((code) => (
          <option key={code} value={code}>
            {moduleName(code)}
          </option>
        ))}
      </select>
      <button type="submit" disabled={busy}>
        Druk QR
      </button>
    </form>
  );
}
