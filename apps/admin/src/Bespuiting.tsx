import { useEffect, useState } from "react";
import { useOffice, useOfficeLoader } from "@plaashek/ui-office";
import { api } from "./api.js";
import { t } from "./copy.js";

interface StockItem {
  id: string;
  name: string;
  unit: string;
  active: boolean;
}

interface Registration {
  id: string;
  itemId: string;
  itemName: string;
  activeIngredient: string;
  defaultReason: string | null;
  lNumber: string | null;
  withholdingPeriod: string | null;
}

/**
 * Bespuiting's own catalog (docs/bespuiting-build-scope.md) — not a list of
 * products, a list of compliance facts about products Stoor already has.
 * Each row is keyed to an existing `stock_items` row; adding one picks that
 * item from Stoor's catalog rather than typing a new name, and the
 * on-hand/latest-reading numbers stay entirely Stoor's and Water's own —
 * this panel only ever writes `product_registrations`. The applications
 * themselves are the shared `BespuitingRollup` panel, not here.
 */
export function Bespuiting() {
  const { session } = useOffice();
  const guard = useOfficeLoader();
  const [items, setItems] = useState<StockItem[] | null>(null);
  const [registrations, setRegistrations] = useState<Registration[] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const c = t();

  const isAdmin = session.role === "admin";

  async function load() {
    await guard(async () => {
      const [{ items: freshItems }, { registrations: freshRegistrations }] = await Promise.all([
        api<{ items: StockItem[] }>("/stock-items", { token: session.token }),
        api<{ registrations: Registration[] }>("/product-registrations", { token: session.token }),
      ]);
      setItems(freshItems);
      setRegistrations(freshRegistrations);
    }, setError);
  }

  useEffect(() => {
    void load();
  }, [session.token]);

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    await guard(async () => {
      await action();
      await load();
    }, setError);
    setBusy(false);
  }

  if (!items || !registrations) return null;

  const registeredItemIds = new Set(registrations.map((registration) => registration.itemId));
  const unregisteredItems = items.filter((item) => !registeredItemIds.has(item.id));

  return (
    <section>
      <h2>{c.registrationsHeading}</h2>
      <p className="muted">{c.registrationsSubheading}</p>
      {error && <p className="error">{error}</p>}

      <div className="card">
        <table>
          <thead>
            <tr>
              <th>{c.itemName}</th>
              <th>{c.activeIngredientLabel}</th>
              <th>{c.lNumberLabel}</th>
              <th>{c.withholdingPeriodLabel}</th>
              {isAdmin && <th></th>}
            </tr>
          </thead>
          <tbody>
            {registrations.map((registration) =>
              isAdmin ? (
                <EditableRegistrationRow
                  key={registration.id}
                  registration={registration}
                  busy={busy}
                  onSave={(body) => run(() => api(`/product-registrations/${registration.id}`, { method: "PATCH", token: session.token, body: JSON.stringify(body) }))}
                />
              ) : (
                <tr key={registration.id}>
                  <td>{registration.itemName}</td>
                  <td>{registration.activeIngredient}</td>
                  <td>{registration.lNumber ?? ""}</td>
                  <td>{registration.withholdingPeriod ?? ""}</td>
                </tr>
              ),
            )}
            {registrations.length === 0 && (
              <tr>
                <td colSpan={isAdmin ? 5 : 4} className="muted">
                  {c.noRegistrationsYet}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {isAdmin && (
        <AddRegistrationForm
          items={unregisteredItems}
          busy={busy}
          onAdd={(body) => run(() => api("/product-registrations", { method: "POST", token: session.token, body: JSON.stringify(body) }))}
        />
      )}
    </section>
  );
}

/** Rename the active ingredient, L-number, default reason, or withholding period — nothing here touches applications already captured. */
function EditableRegistrationRow({
  registration,
  busy,
  onSave,
}: {
  registration: Registration;
  busy: boolean;
  onSave: (body: { active_ingredient: string; default_reason: string | null; l_number: string | null; withholding_period: string | null }) => void;
}) {
  const c = t();
  const [activeIngredient, setActiveIngredient] = useState(registration.activeIngredient);
  const [lNumber, setLNumber] = useState(registration.lNumber ?? "");
  const [withholdingPeriod, setWithholdingPeriod] = useState(registration.withholdingPeriod ?? "");

  const changed =
    activeIngredient !== registration.activeIngredient ||
    lNumber !== (registration.lNumber ?? "") ||
    withholdingPeriod !== (registration.withholdingPeriod ?? "");

  return (
    <tr>
      <td>{registration.itemName}</td>
      <td>
        <input value={activeIngredient} onChange={(event) => setActiveIngredient(event.target.value)} aria-label={c.activeIngredientLabel} />
      </td>
      <td>
        <input value={lNumber} onChange={(event) => setLNumber(event.target.value)} aria-label={c.lNumberLabel} className="short" />
      </td>
      <td>
        <input value={withholdingPeriod} onChange={(event) => setWithholdingPeriod(event.target.value)} aria-label={c.withholdingPeriodLabel} />
      </td>
      <td>
        <button
          type="button"
          className="quiet"
          disabled={busy || !changed}
          onClick={() =>
            onSave({
              active_ingredient: activeIngredient,
              default_reason: registration.defaultReason,
              l_number: lNumber.trim() || null,
              withholding_period: withholdingPeriod.trim() || null,
            })
          }
        >
          {c.saveItem}
        </button>
      </td>
    </tr>
  );
}

function AddRegistrationForm({
  items,
  busy,
  onAdd,
}: {
  items: StockItem[];
  busy: boolean;
  onAdd: (body: { item_id: string; active_ingredient: string; default_reason: string | null; l_number: string | null; withholding_period: string | null }) => void;
}) {
  const c = t();
  const [itemId, setItemId] = useState("");
  const [activeIngredient, setActiveIngredient] = useState("");
  const [defaultReason, setDefaultReason] = useState("");
  const [lNumber, setLNumber] = useState("");
  const [withholdingPeriod, setWithholdingPeriod] = useState("");

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!itemId || !activeIngredient.trim()) return;
    onAdd({
      item_id: itemId,
      active_ingredient: activeIngredient.trim(),
      default_reason: defaultReason.trim() || null,
      l_number: lNumber.trim() || null,
      withholding_period: withholdingPeriod.trim() || null,
    });
    setItemId("");
    setActiveIngredient("");
    setDefaultReason("");
    setLNumber("");
    setWithholdingPeriod("");
  }

  if (items.length === 0) return <p className="muted">{c.noItemsToRegister}</p>;

  return (
    <form className="row" onSubmit={submit}>
      <select value={itemId} onChange={(event) => setItemId(event.target.value)} aria-label={c.itemName} required>
        <option value="" disabled>
          {c.chooseItemOption}
        </option>
        {items.map((item) => (
          <option key={item.id} value={item.id}>
            {item.name}
          </option>
        ))}
      </select>
      <input
        value={activeIngredient}
        onChange={(event) => setActiveIngredient(event.target.value)}
        placeholder={c.activeIngredientLabel}
        aria-label={c.activeIngredientLabel}
      />
      <input value={lNumber} onChange={(event) => setLNumber(event.target.value)} placeholder={c.lNumberLabel} aria-label={c.lNumberLabel} className="short" />
      <input
        value={withholdingPeriod}
        onChange={(event) => setWithholdingPeriod(event.target.value)}
        placeholder={c.withholdingPeriodLabel}
        aria-label={c.withholdingPeriodLabel}
      />
      <input
        value={defaultReason}
        onChange={(event) => setDefaultReason(event.target.value)}
        placeholder={c.defaultReasonLabel}
        aria-label={c.defaultReasonLabel}
      />
      <button type="submit" disabled={busy}>
        {c.addRegistration}
      </button>
    </form>
  );
}
