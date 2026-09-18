/**
 * Turns Werkswinkel's two capture streams into what the office asks for
 * (docs/werkswinkel-build-scope.md). Both derived at read time, never
 * stored.
 */

export interface WorkOrderEvent {
  assetId: string;
  assetName: string;
  personName: string;
  description: string;
  status: string;
  at: Date;
}

export interface OpenWorkOrder {
  assetId: string;
  assetName: string;
  description: string;
  openedBy: string;
  openedAt: string;
}

/**
 * An asset has an open work order when its most recent event's status is
 * `open` — no attempt to match a specific `closed` row to the `open` row it
 * resolves (docs/werkswinkel-build-scope.md: that needs a reference this
 * append-only shape does not carry). Events need not arrive in time order.
 */
export function openWorkOrders(events: WorkOrderEvent[]): OpenWorkOrder[] {
  const latest = new Map<string, WorkOrderEvent>();

  for (const event of events) {
    const current = latest.get(event.assetId);
    if (!current || event.at.getTime() > current.at.getTime()) latest.set(event.assetId, event);
  }

  return [...latest.values()]
    .filter((event) => event.status === "open")
    .sort((a, b) => a.assetName.localeCompare(b.assetName))
    .map((event) => ({
      assetId: event.assetId,
      assetName: event.assetName,
      description: event.description,
      openedBy: event.personName,
      openedAt: event.at.toISOString(),
    }));
}

export interface FuelFill {
  assetId: string;
  assetName: string;
  litresUsed: number;
}

export interface AssetFuel {
  assetId: string;
  assetName: string;
  litresUsed: number;
  fills: number;
}

/** Total litres per asset, all time — Werkswinkel is season-less (plan §6). */
export function fuelByAsset(fills: FuelFill[]): AssetFuel[] {
  const byAsset = new Map<string, AssetFuel>();

  for (const fill of fills) {
    const existing = byAsset.get(fill.assetId);
    if (existing) {
      existing.litresUsed += fill.litresUsed;
      existing.fills += 1;
    } else {
      byAsset.set(fill.assetId, { assetId: fill.assetId, assetName: fill.assetName, litresUsed: fill.litresUsed, fills: 1 });
    }
  }

  return [...byAsset.values()].sort((a, b) => a.assetName.localeCompare(b.assetName));
}
