import { useState } from "react";
import { ApiError, downloadCsv, type Session } from "./api.js";
import { t } from "./copy.js";

/** §10 offboarding, §12 Phase 4: farm data belongs to the farm, out as CSV Excel opens directly. */
export function Export({ session }: { session: Session }) {
  const [error, setError] = useState("");
  const c = t();

  async function download(path: string, filename: string) {
    setError("");
    try {
      await downloadCsv(path, session.token, filename);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : c.offline);
    }
  }

  return (
    <section>
      <h2>{c.exportHeading}</h2>
      {error && <p className="error">{error}</p>}
      <div className="row">
        <button type="button" className="quiet" onClick={() => download("/export/notes.csv", "veldnotas.csv")}>
          {c.exportNotes}
        </button>
        <button type="button" className="quiet" onClick={() => download("/export/harvest.csv", "boord.csv")}>
          {c.exportHarvest}
        </button>
        <button type="button" className="quiet" onClick={() => download("/export/attendance.csv", "span.csv")}>
          {c.exportAttendance}
        </button>
        <button type="button" className="quiet" onClick={() => download("/export/piecework.csv", "stukwerk.csv")}>
          {c.exportPiecework}
        </button>
      </div>
    </section>
  );
}
