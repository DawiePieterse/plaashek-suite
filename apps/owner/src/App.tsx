import { useEffect, useState } from "react";
import {
  AttendanceRollup,
  Exports,
  FarmSummary,
  HarvestRollup,
  OfficeProvider,
  PieceworkPayout,
  Seasons,
  TabPanel,
  Tabs,
  officeTabs,
  useActiveTab,
  type FarmContext,
} from "@plaashek/ui-office";
import { api, ApiError, clearSession, downloadCsv, loadSession, type Session } from "./api.js";
import { t } from "./copy.js";
import { Login } from "./Login.js";

/**
 * The Owner Module is the same tab strip as the Farm Admin Tool over the
 * same panels (plan §4.2, §4.3) — one tab per field module the farm is
 * licensed for, plus the farm's own settings. What the owner does not get is
 * anything that writes: no devices, no piece-work rate, no season edits.
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

  // One /farm load for the whole app: the tab strip needs the farm's licensed
  // modules before it can draw anything, and every panel below needs the same
  // answer.
  useEffect(() => {
    api<FarmContext>("/farm", { token: session.token })
      .then(setContext)
      .catch((caught) => {
        if (caught instanceof ApiError && caught.code === "unauthenticated") return onSignOut();
        setError(caught instanceof ApiError ? caught.message : c.offline);
      });
  }, [session.token]);

  const tabs = officeTabs(context?.modules ?? [], t().farmSettings);
  const [active, setActive] = useActiveTab(tabs, "plaashek.owner.tab");

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
      <header className="topbar">
        <span className="mark" aria-hidden="true">
          P
        </span>
        <h1>{c.appTitle}</h1>
        <button type="button" className="link" onClick={onSignOut}>
          {c.signOut}
        </button>
      </header>

      <main className="app">
        {error && <p className="error">{error}</p>}
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
              <PieceworkPayout payout={null} />
              <Exports kinds={["harvest", "piecework"]} />
            </TabPanel>

            <TabPanel id="span" active={active}>
              <AttendanceRollup />
              <Exports kinds={["attendance"]} />
            </TabPanel>

            <TabPanel id="farm" active={active}>
              <FarmSummary context={context} />
              <Seasons />
            </TabPanel>
          </>
        )}
      </main>
    </OfficeProvider>
  );
}
