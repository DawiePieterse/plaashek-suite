import { useEffect, useState } from "react";
import { useOffice, useOfficeLoader } from "../context.js";

/**
 * The read-only rollups both office tools show: harvest by block, attendance
 * by person, and what piece-work adds up to. They were the Owner Module's
 * screens; the Farm Admin Tool needs the same numbers, so they live here and
 * neither app owns them.
 *
 * All three are derived server-side at read time, so a late-syncing phone
 * changes the answer — none of this is a stored total.
 */

export interface HarvestSummary {
  season: { id: string; name: string } | null;
  blocks: { blockId: string; blockName: string; crates: number; kg: number }[];
}

export interface AttendanceSummary {
  season: { id: string; name: string } | null;
  people: { personId: string; personName: string; days: number; hours: number; openPunches: number }[];
}

export interface PayoutSummary {
  season: { id: string; name: string } | null;
  from: string | null;
  to: string | null;
  people: { personId: string; personName: string; kg: number; days: number; cents: number; unratedKg: number }[];
  unattributedCrates: number;
  unattributedKg: number;
}

export interface WaterSummary {
  readings: { assetId: string; assetName: string; reading: number; note: string | null; personName: string; at: string }[];
}

export interface WorkOrdersSummary {
  open: { assetId: string; assetName: string; description: string; openedBy: string; openedAt: string }[];
}

export interface FuelSummary {
  assets: { assetId: string; assetName: string; litresUsed: number; fills: number }[];
}

const rand = (cents: number) => (cents / 100).toFixed(2);

/** A rollup with nothing in it yet — still titled, so the tab does not look broken. */
function Empty({ heading, message, kind = "empty" }: { heading: string; message: string; kind?: "empty" | "error" }) {
  return (
    <section>
      <h2>{heading}</h2>
      <p className={kind}>{message}</p>
    </section>
  );
}

/**
 * One load, one error line, one "still loading" — the shape all three rollups
 * share. `reloadKey` is for a caller that has just changed something the
 * server derives this from; bumping it re-reads.
 */
function useRollup<T>(path: string, reloadKey = 0) {
  const { api, session } = useOffice();
  const guard = useOfficeLoader();
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    void guard(
      async () => setData(await api<T>(path, { token: session.token })),
      (message) => setError(message),
    );
  }, [session.token, path, reloadKey]);

  return { data, error };
}

export function HarvestRollup() {
  const { c } = useOffice();
  const { data, error } = useRollup<HarvestSummary>("/eienaar/harvest");

  // The heading stays even when there is nothing to show: inside a tab, a
  // bare sentence with no title reads like the tab failed to load.
  if (error) return <Empty heading={c.harvestHeading} message={error} kind="error" />;
  if (!data) return <Empty heading={c.harvestHeading} message={c.loading} />;
  if (!data.season) return <Empty heading={c.harvestHeading} message={c.noActiveSeason} />;
  if (data.blocks.length === 0) return <Empty heading={c.harvestHeading} message={c.noHarvest} />;

  const crates = data.blocks.reduce((sum, block) => sum + block.crates, 0);
  const kg = data.blocks.reduce((sum, block) => sum + block.kg, 0);

  return (
    <section>
      <h2>
        {c.harvestHeading} <span className="pill on">{data.season.name}</span>
      </h2>
      <div className="card">
        <table>
          <thead>
            <tr>
              <th>{c.block}</th>
              <th className="num">{c.crates}</th>
              <th className="num">{c.kg}</th>
            </tr>
          </thead>
          <tbody>
            {data.blocks.map((block) => (
              <tr key={block.blockId}>
                <td>{block.blockName}</td>
                <td className="num">{block.crates}</td>
                <td className="num">{block.kg.toFixed(1)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td>{c.total}</td>
              <td className="num">{crates}</td>
              <td className="num">{kg.toFixed(1)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
}

export function AttendanceRollup() {
  const { c } = useOffice();
  const { data, error } = useRollup<AttendanceSummary>("/eienaar/attendance");

  if (error) return <Empty heading={c.attendanceHeading} message={error} kind="error" />;
  if (!data) return <Empty heading={c.attendanceHeading} message={c.loading} />;
  if (!data.season) return <Empty heading={c.attendanceHeading} message={c.noActiveSeason} />;
  if (data.people.length === 0) return <Empty heading={c.attendanceHeading} message={c.noAttendance} />;

  const days = data.people.reduce((sum, person) => sum + person.days, 0);
  const hours = data.people.reduce((sum, person) => sum + person.hours, 0);
  const anyOpen = data.people.some((person) => person.openPunches > 0);

  return (
    <section>
      <h2>
        {c.attendanceHeading} <span className="pill on">{data.season.name}</span>
      </h2>
      <div className="card">
        <table>
          <thead>
            <tr>
              <th>{c.person}</th>
              <th className="num">{c.days}</th>
              <th className="num">{c.hours}</th>
              <th className="num">{c.open}</th>
            </tr>
          </thead>
          <tbody>
            {data.people.map((person) => (
              <tr key={person.personId}>
                <td>{person.personName}</td>
                <td className="num">{person.days}</td>
                <td className="num">{person.hours.toFixed(1)}</td>
                <td className="num">{person.openPunches || ""}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td>{c.total}</td>
              <td className="num">{days}</td>
              <td className="num">{hours.toFixed(1)}</td>
              <td className="num" />
            </tr>
          </tfoot>
        </table>
      </div>
      {/* Never guessed at server-side, so say what the number means rather than hiding it. */}
      {anyOpen && <p className="muted">{c.openNote}</p>}
    </section>
  );
}

/**
 * What the pickers earned (ADR 0010). Read-only wherever it is drawn — the
 * rate behind it is set in the Farm Admin Tool's own piece-work section, and
 * the caveat under the table travels with the numbers rather than living
 * next to the form.
 */
export function PieceworkPayout({ reloadKey }: { reloadKey?: number }) {
  const { c } = useOffice();
  // This panel owns the fetch wherever it is drawn. The Farm Admin Tool bumps
  // `reloadKey` after a rate change rather than handing in its own copy —
  // one data path, so the two tools cannot show different money.
  const { data, error } = useRollup<PayoutSummary>("/piecework/payout", reloadKey);

  if (error) return <Empty heading={c.payoutHeading} message={error} kind="error" />;
  if (!data) return <Empty heading={c.payoutHeading} message={c.loading} />;
  if (!data.season) return <Empty heading={c.payoutHeading} message={c.noActiveSeason} />;

  const cents = data.people.reduce((sum, person) => sum + person.cents, 0);
  const kg = data.people.reduce((sum, person) => sum + person.kg, 0);

  return (
    <section>
      <h2>{c.payoutHeading}</h2>
      <p className="muted">{c.payoutPeriod(data.season.name, data.from ?? "", data.to ?? "")}</p>
      <div className="card">
        <table>
          <thead>
            <tr>
              <th>{c.person}</th>
              <th className="num">{c.days}</th>
              <th className="num">{c.kg}</th>
              <th className="num">{c.rand}</th>
            </tr>
          </thead>
          <tbody>
            {data.people.map((person) => (
              <tr key={person.personId}>
                <td>{person.personName}</td>
                <td className="num">{person.days}</td>
                <td className="num">{person.kg.toFixed(1)}</td>
                <td className="num">{rand(person.cents)}</td>
              </tr>
            ))}
            {data.people.length === 0 && (
              <tr>
                <td colSpan={4} className="muted">
                  {c.noPiecework}
                </td>
              </tr>
            )}
          </tbody>
          <tfoot>
            <tr>
              <td>{c.total}</td>
              <td className="num" />
              <td className="num">{kg.toFixed(1)}</td>
              <td className="num">{rand(cents)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      {data.unattributedCrates > 0 && <p className="error">{c.unattributed(data.unattributedCrates, data.unattributedKg)}</p>}
      {/* A rand total is what the farm's own rate produced, not a statement that it is lawful (ADR 0010). */}
      <p className="muted">{c.payoutDisclaimer}</p>
    </section>
  );
}

const formatWhen = (lang: string, iso: string) =>
  new Date(iso).toLocaleString(lang === "en" ? "en-ZA" : "af-ZA", { dateStyle: "short", timeStyle: "short" });

/** Water's latest reading per asset (docs/water-build-scope.md) — no season badge, Water is season-less. */
export function WaterRollup() {
  const { c, lang } = useOffice();
  const { data, error } = useRollup<WaterSummary>("/eienaar/water");

  if (error) return <Empty heading={c.waterHeading} message={error} kind="error" />;
  if (!data) return <Empty heading={c.waterHeading} message={c.loading} />;
  if (data.readings.length === 0) return <Empty heading={c.waterHeading} message={c.noWater} />;

  return (
    <section>
      <h2>{c.waterHeading}</h2>
      <div className="card">
        <table>
          <thead>
            <tr>
              <th>{c.asset}</th>
              <th className="num">{c.reading}</th>
              <th>{c.readBy}</th>
              <th>{c.readAt}</th>
            </tr>
          </thead>
          <tbody>
            {data.readings.map((reading) => (
              <tr key={reading.assetId}>
                <td>{reading.assetName}</td>
                <td className="num">{reading.reading}</td>
                <td>{reading.personName}</td>
                <td>{formatWhen(lang, reading.at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/** Werkswinkel's currently open issues (docs/werkswinkel-build-scope.md) — every asset whose most recent event is still `open`. */
export function WorkOrdersRollup() {
  const { c, lang } = useOffice();
  const { data, error } = useRollup<WorkOrdersSummary>("/eienaar/work-orders");

  if (error) return <Empty heading={c.workOrdersHeading} message={error} kind="error" />;
  if (!data) return <Empty heading={c.workOrdersHeading} message={c.loading} />;
  if (data.open.length === 0) return <Empty heading={c.workOrdersHeading} message={c.noWorkOrders} />;

  return (
    <section>
      <h2>{c.workOrdersHeading}</h2>
      <div className="card">
        <table>
          <thead>
            <tr>
              <th>{c.asset}</th>
              <th>{c.description}</th>
              <th>{c.openedBy}</th>
              <th>{c.openedAt}</th>
            </tr>
          </thead>
          <tbody>
            {data.open.map((order) => (
              <tr key={order.assetId}>
                <td>{order.assetName}</td>
                <td>{order.description}</td>
                <td>{order.openedBy}</td>
                <td>{formatWhen(lang, order.openedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/** Werkswinkel's fuel register (docs/werkswinkel-build-scope.md) — litres per asset, all time. */
export function FuelRollup() {
  const { c } = useOffice();
  const { data, error } = useRollup<FuelSummary>("/eienaar/fuel");

  if (error) return <Empty heading={c.fuelHeading} message={error} kind="error" />;
  if (!data) return <Empty heading={c.fuelHeading} message={c.loading} />;
  if (data.assets.length === 0) return <Empty heading={c.fuelHeading} message={c.noFuel} />;

  const litres = data.assets.reduce((sum, asset) => sum + asset.litresUsed, 0);
  const fills = data.assets.reduce((sum, asset) => sum + asset.fills, 0);

  return (
    <section>
      <h2>{c.fuelHeading}</h2>
      <div className="card">
        <table>
          <thead>
            <tr>
              <th>{c.asset}</th>
              <th className="num">{c.litres}</th>
              <th className="num">{c.fills}</th>
            </tr>
          </thead>
          <tbody>
            {data.assets.map((asset) => (
              <tr key={asset.assetId}>
                <td>{asset.assetName}</td>
                <td className="num">{asset.litresUsed.toFixed(1)}</td>
                <td className="num">{asset.fills}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td>{c.total}</td>
              <td className="num">{litres.toFixed(1)}</td>
              <td className="num">{fills}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
}
