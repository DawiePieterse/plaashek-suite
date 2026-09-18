import { useEffect, useState } from "react";
import {
  AttendanceRollup,
  Exports,
  FarmSummary,
  HarvestRollup,
  OfficeProvider,
  Seasons,
  TabPanel,
  Tabs,
  officeTabs,
  useActiveTab,
  type FarmContext,
} from "@plaashek/ui-office";
import { api, ApiError, clearSession, downloadCsv, loadSession, type Session } from "./api.js";
import { t } from "./copy.js";
import { Devices } from "./Devices.js";
import { Login } from "./Login.js";
import { Piecework } from "./Piecework.js";

/**
 * One tab per field module the farm is licensed for, plus the farm's own
 * settings (plan §4.2). The Owner Module draws the same strip over the same
 * panels — the difference is what this tool may write: devices, seasons and
 * the piece-work rate.
 */
export function App() {
  const [session, setSession] = useState<Session | null>(loadSession);

  if (!session) return <Login onLogin={setSession} />;

  const signOut = () => {
    clearSession();
    setSession(null);
  };

  return <SignedIn session={session} onSignOut={signOut} />;
}

function SignedIn({ session, onSignOut }: { session: Session; onSignOut: () => void }) {
  const [context, setContext] = useState<FarmContext | null>(null);
  const [error, setError] = useState("");
  const c = t();

  /** One /farm load for the whole app — the tab strip needs the licensed modules, and every panel needs the same answer. */
  async function loadContext() {
    try {
      setContext(await api<FarmContext>("/farm", { token: session.token }));
    } catch (caught) {
      if (caught instanceof ApiError && caught.code === "unauthenticated") return onSignOut();
      setError(caught instanceof ApiError ? caught.message : c.offline);
    }
  }

  useEffect(() => {
    void loadContext();
  }, [session.token]);

  const tabs = officeTabs(context?.modules ?? [], c.farmSettings);
  const [active, setActive] = useActiveTab(tabs, "plaashek.admin.tab");

  return (
    <OfficeProvider
      value={{
        session,
        api,
        downloadCsv,
        lang: session.language,
        errorMessage: (caught) => (caught instanceof ApiError ? caught.message : c.offline),
        isUnauthenticated: (caught) => caught instanceof ApiError && caught.code === "unauthenticated",
        onSessionExpired: onSignOut,
      }}
    >
      <header className="topbar no-print">
        <span className="mark" aria-hidden="true">
          P
        </span>
        <h1>{c.appTitle}</h1>
        <button type="button" className="link" onClick={onSignOut}>
          {c.signOut}
        </button>
      </header>

      <main className="app">
        {error && <p className="error no-print">{error}</p>}
        {!context ? (
          <p className="empty">{c.loading}</p>
        ) : (
          <>
            <Tabs tabs={tabs} active={active} onSelect={setActive} />

            <TabPanel id="veldnotas" active={active}>
              <Exports kinds={["notes"]} />
            </TabPanel>

            <TabPanel id="boord" active={active}>
              <HarvestRollup />
              {/* Piece-work rides on Boord's capture (ADR 0009), so it belongs in Boord's tab, not a tab of its own. */}
              <Piecework session={session} context={context} />
              <Exports kinds={["harvest", "piecework"]} />
            </TabPanel>

            <TabPanel id="span" active={active}>
              <AttendanceRollup />
              <Exports kinds={["attendance"]} />
            </TabPanel>

            <TabPanel id="farm" active={active}>
              <FarmSummary context={context} />
              <Devices session={session} context={context} onReloadContext={loadContext} onSessionExpired={onSignOut} />
              <Seasons />
            </TabPanel>
          </>
        )}
      </main>
    </OfficeProvider>
  );
}
