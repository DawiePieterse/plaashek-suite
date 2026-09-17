import { useEffect, useState } from "react";
import { api, ApiError, type AttendanceSummary, type Session } from "./api.js";
import { t } from "./copy.js";

/** Span in owner form (docs/span-build-scope.md): days and hours per person, active season. */
export function Attendance({ session, onSessionExpired }: { session: Session; onSessionExpired: () => void }) {
  const [summary, setSummary] = useState<AttendanceSummary | null>(null);
  const [error, setError] = useState("");
  const c = t();

  useEffect(() => {
    api<AttendanceSummary>("/eienaar/attendance", { token: session.token })
      .then(setSummary)
      .catch((caught) => {
        if (caught instanceof ApiError && caught.code === "unauthenticated") return onSessionExpired();
        setError(caught instanceof ApiError ? caught.message : c.offline);
      });
  }, [session.token]);

  if (error) return <p className="error">{error}</p>;
  if (!summary) return <p className="empty">{c.loading}</p>;
  if (!summary.season) return <p className="empty">{c.noSeason}</p>;
  if (summary.people.length === 0) return <p className="empty">{c.noAttendance}</p>;

  const totalDays = summary.people.reduce((sum, person) => sum + person.days, 0);
  const totalHours = summary.people.reduce((sum, person) => sum + person.hours, 0);
  const anyOpen = summary.people.some((person) => person.openPunches > 0);

  return (
    <section>
      <h2>
        {c.attendanceHeading} <span className="pill on">{summary.season.name}</span>
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
            {summary.people.map((person) => (
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
              <td className="num">{totalDays}</td>
              <td className="num">{totalHours.toFixed(1)}</td>
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
