import { useEffect, useState } from "react";
import { moduleName, useOffice, type FarmContext } from "@plaashek/ui-office";
import { api, ApiError, formatWhen, type Device, type PairingToken, type Session } from "./api.js";
import { t } from "./copy.js";
import { PairingSlip, type SlipDetails } from "./PairingSlip.js";

export function Devices({
  session,
  context,
  onReloadContext,
  onSessionExpired,
}: {
  session: Session;
  /** Loaded once by the app shell — the tab strip needs it too, so this panel does not fetch it again. */
  context: FarmContext;
  onReloadContext: () => Promise<void>;
  onSessionExpired: () => void;
}) {
  const [devices, setDevices] = useState<Device[]>([]);
  const [slip, setSlip] = useState<SlipDetails | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const isAdmin = session.role === "admin";
  const c = t();

  async function load() {
    try {
      setDevices((await api<{ devices: Device[] }>("/devices", { token: session.token })).devices);
      // A revoke or a new pairing can change what the farm is waiting on, and
      // that count lives in the shell's copy of /farm.
      await onReloadContext();
    } catch (caught) {
      if (caught instanceof ApiError && caught.code === "unauthenticated") return onSessionExpired();
      setError(caught instanceof ApiError ? caught.message : c.offline);
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
      setError(caught instanceof ApiError ? caught.message : c.offline);
    } finally {
      setBusy(false);
    }
  }

  function showSlip(pairingToken: PairingToken, personName: string) {
    setSlip({ pairingToken, personName, farmName: context.farm.name });
  }

  const personName = (device: Device) => device.assignedPerson?.personName ?? c.nobodyAssigned;

  return (
    <section>
      <div className="section-head no-print">
        <h2>{c.devicesHeading}</h2>
        <span className="pill">{devices.length}</span>
      </div>

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

      {devices.length === 0 && <p className="empty no-print">{c.noDevices}</p>}

      {devices.length > 0 && (
        <div className="card no-print">
          <table className="devices-table">
            <thead>
              <tr>
                <th>{c.deviceCol}</th>
                <th>{c.person}</th>
                <th>{c.module}</th>
                <th>{c.pendingCol}</th>
                {isAdmin && <th>{c.actionsCol}</th>}
              </tr>
            </thead>
            <tbody>
              {devices.map((device) => (
                <tr key={device.id}>
                  <td>{device.label ?? c.unnamedDevice}</td>
                  <td>{personName(device)}</td>
                  <td>{device.modules.length ? device.modules.map(moduleName).join(", ") : c.modulesNone}</td>
                  <td>
                    {device.pendingPairingTokens.map((pending) => (
                      <div key={pending.id} className="pending">
                        {c.pendingPairing(moduleName(pending.moduleCode), formatWhen(pending.printedAt), formatWhen(pending.expiresAt))}
                        {isAdmin && (
                          <>
                            <button
                              type="button"
                              className="quiet small"
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
                              {c.reprint}
                            </button>
                            <button
                              type="button"
                              className="quiet small"
                              disabled={busy}
                              onClick={() => run(() => api(`/pairing-tokens/${pending.id}/cancel`, { method: "POST", token: session.token }))}
                            >
                              {c.cancel}
                            </button>
                          </>
                        )}
                      </div>
                    ))}
                  </td>
                  {isAdmin && (
                    <td>
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
                            if (!confirm(c.revokeConfirm)) return;
                            void run(() => api(`/devices/${device.id}/revoke`, { method: "POST", token: session.token }));
                          }}
                        >
                          {c.revoke}
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

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
  const c = t();
  const office = useOffice();

  // Nothing licensed means nothing to pair a phone for — the farm settings
  // tab says why, so here it is just the reason this form is missing.
  if (context.modules.length === 0) {
    return <p className="empty no-print">{office.c.noLicence}</p>;
  }

  return (
    <form
      className="card fields-row no-print"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit({ personId, moduleCode, ...(label ? { label } : {}) });
        setLabel("");
      }}
    >
      <label>
        {c.person}
        <select value={personId} onChange={(e) => setPersonId(e.target.value)} required>
          <option value="">{c.choose}</option>
          {context.people.map((person) => (
            <option key={person.id} value={person.id}>
              {person.name}
            </option>
          ))}
        </select>
      </label>

      <label>
        {c.module}
        <select value={moduleCode} onChange={(e) => setModuleCode(e.target.value)} required>
          <option value="">{c.choose}</option>
          {context.modules.map((code) => (
            <option key={code} value={code}>
              {moduleName(code)}
            </option>
          ))}
        </select>
      </label>

      <label>
        {c.labelOptional}
        <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder={c.labelPlaceholder} />
      </label>

      <button type="submit" disabled={busy}>
        {c.addDevice}
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
  const c = t();

  // A module already installed or already waiting for a scan has nothing to add.
  const taken = [...device.modules, ...device.pendingPairingTokens.map((pending) => pending.moduleCode)];
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
        <option value="">{c.addApp}</option>
        {available.map((code) => (
          <option key={code} value={code}>
            {moduleName(code)}
          </option>
        ))}
      </select>
      <button type="submit" disabled={busy}>
        {c.printQr}
      </button>
    </form>
  );
}
