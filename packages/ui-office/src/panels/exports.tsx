import { useState } from "react";
import { useOffice } from "../context.js";

/**
 * The farm's data on its way out (plan §10: farm data belongs to the farm).
 * One button per module, drawn inside that module's own tab rather than in
 * one pile at the bottom of the page — the export for Boord belongs with
 * Boord.
 */
export type ExportKind = "notes" | "harvest" | "attendance" | "piecework";

const FILES: Record<ExportKind, { path: string; filename: string }> = {
  notes: { path: "/export/notes.csv", filename: "veldnotas.csv" },
  harvest: { path: "/export/harvest.csv", filename: "boord.csv" },
  attendance: { path: "/export/attendance.csv", filename: "span.csv" },
  piecework: { path: "/export/piecework.csv", filename: "stukwerk.csv" },
};

export function Exports({ kinds }: { kinds: ExportKind[] }) {
  const { c, session, downloadCsv, errorMessage, isUnauthenticated, onSessionExpired } = useOffice();
  const [error, setError] = useState("");

  const label: Record<ExportKind, string> = {
    notes: c.exportNotes,
    harvest: c.exportHarvest,
    attendance: c.exportAttendance,
    piecework: c.exportPiecework,
  };

  async function download(kind: ExportKind) {
    setError("");
    try {
      await downloadCsv(FILES[kind].path, session.token, FILES[kind].filename);
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
