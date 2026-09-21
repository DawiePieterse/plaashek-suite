import { useState } from "react";
import { useOffice } from "../context.js";

/**
 * The farm's data on its way out (plan §10: farm data belongs to the farm).
 * One button per module, drawn inside that module's own tab rather than in
 * one pile at the bottom of the page — the export for Boord belongs with
 * Boord.
 */
export type ExportKind =
  | "notes"
  | "harvest"
  | "attendance"
  | "stock"
  | "water"
  | "work-orders"
  | "fuel"
  | "piecework"
  | "animals"
  | "movements"
  | "treatments"
  | "weights";

/** Paths only — the file's name comes back on the response, from the one place that decides it. */
const PATHS: Record<ExportKind, string> = {
  notes: "/export/notes.csv",
  harvest: "/export/harvest.csv",
  attendance: "/export/attendance.csv",
  stock: "/export/stock.csv",
  water: "/export/water.csv",
  "work-orders": "/export/work-orders.csv",
  fuel: "/export/fuel.csv",
  piecework: "/export/piecework.csv",
  animals: "/export/animals.csv",
  movements: "/export/movements.csv",
  treatments: "/export/treatments.csv",
  weights: "/export/weights.csv",
};

export function Exports({ kinds }: { kinds: ExportKind[] }) {
  const { c, session, downloadCsv, errorMessage, isUnauthenticated, onSessionExpired } = useOffice();
  const [error, setError] = useState("");

  const label: Record<ExportKind, string> = {
    notes: c.exportNotes,
    harvest: c.exportHarvest,
    attendance: c.exportAttendance,
    stock: c.exportStock,
    water: c.exportWater,
    "work-orders": c.exportWorkOrders,
    fuel: c.exportFuel,
    piecework: c.exportPiecework,
    animals: c.exportAnimals,
    movements: c.exportMovements,
    treatments: c.exportTreatments,
    weights: c.exportWeights,
  };

  async function download(kind: ExportKind) {
    setError("");
    try {
      await downloadCsv(PATHS[kind], session.token);
    } catch (caught) {
      if (isUnauthenticated(caught)) return onSessionExpired();
      setError(errorMessage(caught));
    }
  }

  return (
    <section>
      <h2>{c.exportHeading}</h2>
      {error && <p className="error">{error}</p>}
      <div className="row">
        {kinds.map((kind) => (
          <button key={kind} type="button" className="quiet" onClick={() => download(kind)}>
            {label[kind]}
          </button>
        ))}
      </div>
    </section>
  );
}
