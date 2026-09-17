import { useState } from "react";
import { clearSession, loadSession, type Session } from "./api.js";
import { t } from "./copy.js";
import { Devices } from "./Devices.js";
import { Export } from "./Export.js";
import { Login } from "./Login.js";
import { Seasons } from "./Seasons.js";

export function App() {
  const [session, setSession] = useState<Session | null>(loadSession);

  if (!session) return <Login onLogin={setSession} />;

  const signOut = () => {
    clearSession();
    setSession(null);
  };

  return (
    <>
      <header className="topbar no-print">
        <span className="mark" aria-hidden="true">
          P
        </span>
        <h1>{t().appTitle}</h1>
        <button type="button" className="link" onClick={signOut}>
          {t().signOut}
        </button>
      </header>
      <main className="app">
        <Devices session={session} onSessionExpired={signOut} />
        <Seasons session={session} onSessionExpired={signOut} />
        <Export session={session} />
      </main>
    </>
  );
}
