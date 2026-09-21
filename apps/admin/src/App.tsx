import { useState } from "react";
import { Login, OfficeShell } from "@plaashek/ui-office";
import { api, ApiError, clearSession, downloadCsv, loadSession, saveSession, type Session } from "./api.js";
import { setLang, t } from "./copy.js";
import { Devices } from "./Devices.js";
import { Kudde } from "./Kudde.js";
import { MasterData } from "./MasterData.js";
import { Piecework } from "./Piecework.js";
import { Stoor } from "./Stoor.js";
import { Water } from "./Water.js";

/**
 * The Farm Admin Tool is the shared office shell (plan §4.2) plus the two
 * things only this tool may do: manage devices, and set up piece-work. Each
 * lands inside the tab it belongs to rather than as a screen of its own.
 */
export function App() {
  const [session, setSession] = useState<Session | null>(loadSession);
  /** Bumped when the piece-work rate changes, so the shared payout panel re-prices. */
  const [payoutKey, setPayoutKey] = useState(0);
  const c = t();

  if (!session) {
    return (
      <Login
        onLogin={setSession}
        api={api}
        saveSession={saveSession}
        setLang={setLang}
        copy={{ appTitle: c.appTitle, email: c.email, password: c.password, signIn: c.signIn, signingIn: c.signingIn, offline: c.offline }}
      />
    );
  }

  const signOut = () => {
    clearSession();
    setSession(null);
  };

  return (
    <OfficeShell
      session={session}
      api={api}
      downloadCsv={downloadCsv}
      errorMessage={(caught) => (caught instanceof ApiError ? caught.message : c.offline)}
      isUnauthenticated={(caught) => caught instanceof ApiError && caught.code === "unauthenticated"}
      onSignOut={signOut}
      title={c.appTitle}
      signOutLabel={c.signOut}
      storageKey="plaashek.admin.tab"
      hideChromeOnPrint
      payoutKey={payoutKey}
      extras={{
        boord: <Piecework onRateChanged={() => setPayoutKey((key) => key + 1)} />,
        stoor: <Stoor />,
        water: <Water />,
        kudde: <Kudde />,
        farm: (
          <>
            <MasterData />
            <Devices />
          </>
        ),
      }}
    />
  );
}
