/**
 * A work order's lifecycle is two append-only rows, paired at read time —
 * Span's shape (docs/werkswinkel-build-scope.md), not a status column
 * edited in place. Nothing derived is stored: a `closed` that arrives late
 * from a phone at the gate changes the answer.
 */

export interface WorkOrderEvent {
  assetId: string;
  assetName: string;
  event: "opened" | "closed";
  description: string | null;
  at: Date;
}

export interface OpenJob {
  assetId: string;
  assetName: string;
  description: string | null;
  openedAt: Date;
}

/**
 * Pairs each `opened` with the next `closed` for the same asset, in time
 * order, FIFO — the oldest open job on an asset is the one a `closed` event
 * closes. A `closed` with nothing open is ignored rather than guessed at;
 * an asset can have more than one job open at once (two faults reported
 * before either is fixed).
 */
export function openWorkOrders(events: WorkOrderEvent[]): OpenJob[] {
  const byAsset = new Map<string, WorkOrderEvent[]>();
  for (const event of events) {
    const list = byAsset.get(event.assetId);
    if (list) list.push(event);
    else byAsset.set(event.assetId, [event]);
  }

  const open: OpenJob[] = [];

  for (const ownEvents of byAsset.values()) {
    const ordered = [...ownEvents].sort((a, b) => a.at.getTime() - b.at.getTime());
    const openQueue: WorkOrderEvent[] = [];

    for (const event of ordered) {
      if (event.event === "opened") openQueue.push(event);
      else openQueue.shift();
    }

    for (const event of openQueue) {
      open.push({ assetId: event.assetId, assetName: event.assetName, description: event.description, openedAt: event.at });
    }
  }

  return open.sort((a, b) => a.openedAt.getTime() - b.openedAt.getTime());
}
