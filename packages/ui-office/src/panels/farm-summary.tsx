import { useOffice } from "../context.js";
import { moduleName } from "../tabs.js";

/**
 * What is true of the whole farm rather than one module: its name, the
 * language its screens and phones are in (plan §6), which modules Plaashek
 * Management has switched on, and anything the office has to act on.
 *
 * The two waiting counts are here rather than on a module tab on purpose —
 * a lapsed licence holds captures across every module (plan §5), and
 * captures with no season are a season problem, which is a farm setting.
 */
export interface FarmContext {
  farm: { id: string; name: string };
  people: { id: string; name: string }[];
  modules: string[];
  waiting: { held: number; withoutSeason: number };
}

export function FarmSummary({ context }: { context: FarmContext }) {
  const { c, lang } = useOffice();

  return (
    <section>
      <h2>{c.farmSettings}</h2>

      <div className="card">
        <dl className="facts">
          <dt>{c.farmLabel}</dt>
          <dd>{context.farm.name}</dd>
          <dt>{c.languageLabel}</dt>
          <dd>{c.languageName[lang]}</dd>
          <dt>{c.licensedModules}</dt>
          <dd>{context.modules.length > 0 ? context.modules.map(moduleName).join(", ") : "—"}</dd>
        </dl>
      </div>

      {context.modules.length === 0 && <p className="empty">{c.noLicence}</p>}
      {context.waiting.held > 0 && <p className="waiting">{c.heldWaiting(context.waiting.held)}</p>}
      {context.waiting.withoutSeason > 0 && <p className="waiting">{c.withoutSeason(context.waiting.withoutSeason)}</p>}
    </section>
  );
}
