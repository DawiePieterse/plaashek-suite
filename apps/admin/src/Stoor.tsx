import { useEffect, useState } from "react";
import { useOffice, useOfficeLoader } from "@plaashek/ui-office";
import { api } from "./api.js";
import { CatalogCard, type CatalogItem } from "./CatalogCard.js";
import { t } from "./copy.js";

/**
 * Stoor's catalog (docs/stoor-build-scope.md) — add an item, in whatever
 * unit the farm already counts it in, and retire one that is no longer
 * stocked without losing the moves already logged against it. The
 * on-hand numbers are the shared `StockRollup` panel; this is only the
 * catalog. Rendering is shared with Water's identical shape via `CatalogCard`.
 */
export function Stoor() {
  const { session } = useOffice();
  const guard = useOfficeLoader();
  const [items, setItems] = useState<CatalogItem[] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const c = t();

  const isAdmin = session.role === "admin";

  async function load() {
    await guard(async () => {
      const { items: fresh } = await api<{ items: CatalogItem[] }>("/stock-items", { token: session.token });
      setItems(fresh);
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

  if (!items) return null;

  return (
    <CatalogCard
      heading={c.stoorCatalogHeading}
      error={error}
      emptyText={c.noStockItemsYet}
      nameLabel={c.itemName}
      unitLabel={c.itemUnit}
      activeLabel={c.itemActive}
      namePlaceholder={c.itemNamePlaceholder}
      unitPlaceholder={c.itemUnitPlaceholder}
      addLabel={c.addItem}
      saveLabel={c.saveItem}
      yesLabel={c.yes}
      noLabel={c.no}
      items={items}
      isAdmin={isAdmin}
      busy={busy}
      onAdd={(name, unit) => run(() => api("/stock-items", { method: "POST", token: session.token, body: JSON.stringify({ name, unit }) }))}
      onSave={(item, body) => run(() => api(`/stock-items/${item.id}`, { method: "PATCH", token: session.token, body: JSON.stringify(body) }))}
    />
  );
}
