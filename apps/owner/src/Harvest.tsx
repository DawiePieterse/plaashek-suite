import { useEffect, useState } from "react";
import { api, ApiError, type HarvestSummary, type Session } from "./api.js";
import { t } from "./copy.js";

/** Eienaar's first screen (docs/boord-reuse-audit.md): totals only, by block, for the active season. */
export function Harvest({ session, onSessionExpired }: { session: Session; onSessionExpired: () => void }) {
  const [summary, setSummary] = useState<HarvestSummary | null>(null);
  const [error, setError] = useState("");
  const c = t();

  useEffect(() => {
    api<HarvestSummary>("/eienaar/harvest", { token: session.token })
      .then(setSummary)
      .catch((caught) => {
        if (caught instanceof ApiError && caught.code === "unauthenticated") return onSessionExpired();
        setError(caught instanceof ApiError ? caught.message : c.offline);
      });
  }, [session.token]);

  if (error) return <p className="error">{error}</p>;
  if (!summary) return <p className="empty">{c.loading}</p>;
  if (!summary.season) return <p className="empty">{c.noSeason}</p>;
  if (summary.blocks.length === 0) return <p className="empty">{c.noHarvest}</p>;

  const totalCrates = summary.blocks.reduce((sum, b) => sum + b.crates, 0);
  const totalKg = summary.blocks.reduce((sum, b) => sum + b.kg, 0);

  return (
    <section>
      <h2>
        {c.harvestHeading} <span className="pill on">{summary.season.name}</span>
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
            {summary.blocks.map((block) => (
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
              <td className="num">{totalCrates}</td>
              <td className="num">{totalKg.toFixed(1)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
}
