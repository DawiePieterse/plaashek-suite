import { useEffect, useState } from "react";
import { useOffice, useOfficeLoader } from "@plaashek/ui-office";
import { api } from "./api.js";
import { CatalogCard, type CatalogItem } from "./CatalogCard.js";
import { t } from "./copy.js";

/**
 * Water's catalog (docs/water-build-scope.md) — add a point, in whatever
 * unit the farm already reads it in, and decommission one that no longer
 * exists without losing the readings already logged against it. The
 * latest-reading-plus-delta numbers are the shared `WaterRollup` panel;
 * this is only the catalog. Rendering is shared with Stoor's identical
 * shape via `CatalogCard`.
 */
export function Water() {
  const { session } = useOffice();
  const guard = useOfficeLoader();
  const [points, setPoints] = useState<CatalogItem[] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const c = t();

  const isAdmin = session.role === "admin";

  async function load() {
    await guard(async () => {
      const { points: fresh } = await api<{ points: CatalogItem[] }>("/water-points", { token: session.token });
      setPoints(fresh);
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

  if (!points) return null;

  return (
    <CatalogCard
      heading={c.waterPointsHeading}
      error={error}
      emptyText={c.noWaterPointsYet}
      nameLabel={c.point}
      unitLabel={c.unit}
      activeLabel={c.itemActive}
      namePlaceholder={c.pointNamePlaceholder}
      unitPlaceholder={c.pointUnitPlaceholder}
      addLabel={c.addPoint}
      saveLabel={c.saveItem}
      yesLabel={c.yes}
      noLabel={c.no}
      items={points}
      isAdmin={isAdmin}
      busy={busy}
      onAdd={(name, unit) => run(() => api("/water-points", { method: "POST", token: session.token, body: JSON.stringify({ name, unit }) }))}
      onSave={(point, body) => run(() => api(`/water-points/${point.id}`, { method: "PATCH", token: session.token, body: JSON.stringify(body) }))}
    />
  );
}
