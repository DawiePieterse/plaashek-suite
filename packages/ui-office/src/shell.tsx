import { useEffect, useState, type ReactNode } from "react";
import { OfficeProvider, type OfficeSession } from "./context.js";
import { conditionLabel, officeCopy, officeLocale, type Lang } from "./copy.js";
import { Exports } from "./panels/exports.js";
import { FarmSummary } from "./panels/farm-summary.js";
import type { FarmContext } from "./farm-context.js";
import { AttendanceRollup, HarvestRollup, NotesRollup, PieceworkPayout, StockRollup, WaterRollup, WorkOrderRollup } from "./panels/rollups.js";
import { Seasons } from "./panels/seasons.js";
import { FARM_SETTINGS_TAB, officeTabs, TabPanel, Tabs, useActiveTab, type ModuleTab } from "./tabs.js";

/**
 * Both farm-facing tools are this: a tab per licensed field module, plus the
 * farm's settings (plan §4.2, §4.3). The panels are the same in each — what
 * differs is what the role may write, which each panel decides for itself,
 * and the extra panels the Farm Admin Tool slots in.
 *
 * `extra` is where a hosting app's own panel lands inside that tab, placed by
 * the tab rather than bolted on the end: the Farm Admin Tool's piece-work
 * setup belongs above the payout it changes, and its device list above the
 * seasons.
 */
type Panel = (extra: ReactNode, payoutKey: number) => ReactNode;

/**
 * Typed against `MODULE_TABS`, so the two cannot drift: a module in that list
 * with no panel here is a compile error, and a panel for a module not in the
 * list is too. That is the whole "an empty tab is worse than no tab" rule,
 * checked rather than remembered.
 */
const MODULE_PANELS: Record<ModuleTab, Panel> = {
  veldnotas: (extra) => (
    <>
      <NotesRollup />
      {extra}
      <Exports kinds={["notes"]} />
    </>
  ),
  boord: (extra, payoutKey) => (
    <>
      <HarvestRollup />
      {/* Piece-work rides on Boord's capture (ADR 0009) — its own tab would split one job in two. */}
      {extra}
      <PieceworkPayout reloadKey={payoutKey} />
      <Exports kinds={["harvest", "piecework"]} />
    </>
  ),
  span: (extra) => (
    <>
      <AttendanceRollup />
      {extra}
      <Exports kinds={["attendance"]} />
    </>
  ),
  stoor: (extra) => (
    <>
      <StockRollup />
      {extra}
      <Exports kinds={["stock"]} />
    </>
  ),
  water: (extra) => (
    <>
      <WaterRollup />
      {extra}
      <Exports kinds={["water"]} />
    </>
  ),
  werkswinkel: (extra) => (
    <>
      <WorkOrderRollup />
      {extra}
      <Exports kinds={["work-orders", "fuel"]} />
    </>
  ),
};

export interface OfficeShellProps {
  session: OfficeSession & { language: Lang };
  /** The host app's fetch wrapper and CSV download — each tool has its own base URL and session storage. */
  api: <T>(path: string, init?: RequestInit & { token?: string }) => Promise<T>;
  downloadCsv: (path: string, token: string) => Promise<void>;
  errorMessage: (caught: unknown) => string;
  isUnauthenticated: (caught: unknown) => boolean;
  onSignOut: () => void;
  title: string;
  signOutLabel: string;
  /** Where this tool remembers its open tab — the two tools do not share one. */
  storageKey: string;
  /**
   * Panels only this tool has, keyed by tab id. The Farm Admin Tool passes
   * its device list and piece-work setup; the Owner Module passes nothing
   * today and gets its own screens the same way when it has them.
   */
  extras?: Partial<Record<ModuleTab | typeof FARM_SETTINGS_TAB, ReactNode>>;
  /** The Farm Admin Tool prints pairing slips and worker cards, so its chrome hides on print. */
  hideChromeOnPrint?: boolean;
  /** Bumped by a host that has just changed something the payout is derived from (a new rate). */
  payoutKey?: number;
}

export function OfficeShell({
  session,
  api,
  downloadCsv,
  errorMessage,
  isUnauthenticated,
  onSignOut,
  title,
  signOutLabel,
  storageKey,
  extras = {},
  hideChromeOnPrint = false,
  payoutKey = 0,
}: OfficeShellProps) {
  const [context, setContext] = useState<FarmContext | null>(null);
  const [error, setError] = useState("");
  const c = officeCopy(session.language);
  const chrome = hideChromeOnPrint ? " no-print" : "";

  // One /farm load for the whole tool: the tab strip needs the farm's
  // licensed modules before it can draw anything, and every panel below
  // needs the same answer. Panels that write to what /farm answers (master
  // data's people/blocks/camps) call `refreshFarm` afterwards rather than
  // keeping their own copy, so a person added in one place is immediately
  // pickable everywhere else — the device picker included.
  async function loadFarm() {
    try {
      setContext(await api<FarmContext>("/farm", { token: session.token }));
    } catch (caught) {
      if (isUnauthenticated(caught)) return onSignOut();
      setError(errorMessage(caught));
    }
  }

  useEffect(() => {
    void loadFarm();
  }, [session.token]);

  const tabs = officeTabs(context?.modules ?? [], session.language);
  const [active, setActive] = useActiveTab(tabs, storageKey);

  const weather = useFarmWeather(api, session.token, context?.farm.coords ?? null);

  return (
    <>
      <header className={`topbar${chrome}`}>
        <div className="topbar-id">
          {/* The band answers "which farm, what day, which tool" at a glance —
              the farm's name leads once /farm has answered; before that the
              tool's own name holds the spot so the band never renders empty. */}
          <h1>{context ? context.farm.name : title}</h1>
          <BandClock lang={session.language} />
          {context && <p className="who">{title}</p>}
        </div>
        {weather && (
          <p className="topbar-weather">
            {Math.round(weather.temp)}°C · {conditionLabel(c, weather.condition)} · {c.humidity(Math.round(weather.humidity))}
          </p>
        )}
        <button type="button" className="link" onClick={onSignOut}>
          {signOutLabel}
        </button>
      </header>

      <main className="app">
        {error && <p className={`error${chrome}`}>{error}</p>}
        {!context ? (
          <p className="empty">{c.loading}</p>
        ) : (
          <OfficeProvider
            value={{
              session,
              context,
              api,
              downloadCsv,
              lang: session.language,
              errorMessage,
              isUnauthenticated,
              onSessionExpired: onSignOut,
              refreshFarm: loadFarm,
            }}
          >
            <Tabs tabs={tabs} active={active} onSelect={setActive} />

            {tabs.map((tab) => (
              <TabPanel key={tab.id} id={tab.id} active={active}>
                {tab.id === FARM_SETTINGS_TAB ? (
                  <>
                    <FarmSummary />
                    {extras[FARM_SETTINGS_TAB]}
                    <Seasons />
                  </>
                ) : (
                  MODULE_PANELS[tab.id](extras[tab.id], payoutKey)
                )}
              </TabPanel>
            ))}
          </OfficeProvider>
        )}
      </main>
    </>
  );
}

/**
 * The band's date-and-time line. Its own leaf component on purpose: the
 * 1-second tick re-renders only this one <p>, not the shell and every panel
 * under it.
 */
function BandClock({ lang }: { lang: Lang }) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const locale = officeLocale(lang);
  return (
    <p className="topbar-sub">
      {now.toLocaleDateString(locale, { weekday: "long", day: "numeric", month: "long", year: "numeric" })} ·{" "}
      {now.toLocaleTimeString(locale)}
    </p>
  );
}

interface CurrentWeather {
  temp: number;
  humidity: number;
  condition: string;
}

/** How long a weather reading stands before the band asks the server again. */
const WEATHER_REFRESH_MS = 15 * 60 * 1000;

/**
 * The band's weather line, from the farm's stored coordinates via the
 * server's Open-Meteo proxy. Decoration, not data: any failure — no
 * coordinates set yet, Open-Meteo down, no connection, even an expired
 * session (the next real call signs the office out) — just means no line,
 * never an error the office has to dismiss. That is also why this is not
 * `useRollup`: no error line, and it polls.
 */
function useFarmWeather(
  api: <T>(path: string, init?: RequestInit & { token?: string }) => Promise<T>,
  token: string,
  coords: { lat: number; lon: number } | null,
): CurrentWeather | null {
  const [weather, setWeather] = useState<CurrentWeather | null>(null);

  useEffect(() => {
    if (!coords) {
      setWeather(null);
      return;
    }

    let stale = false;
    async function load() {
      try {
        const fresh = await api<CurrentWeather>("/farm/weather", { token });
        if (!stale) setWeather(fresh);
      } catch {
        // Stale beats gone mid-session; before the first reading there is nothing to keep showing.
      }
    }

    void load();
    const timer = setInterval(() => void load(), WEATHER_REFRESH_MS);
    return () => {
      stale = true;
      clearInterval(timer);
    };
    // The panels' `refreshFarm` replaces `context` (a new coords object each
    // time), so the effect keys on the values, not the object.
  }, [coords?.lat, coords?.lon, token]);

  return weather;
}
