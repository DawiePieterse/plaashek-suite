import { useState } from "react";
import { clearSession, loadSession, type Session } from "./api.js";
import { t } from "./copy.js";
import { Export } from "./Export.js";
import { Harvest } from "./Harvest.js";
import { Login } from "./Login.js";

export function App() {
  const [session, setSession] = useState<Session | null>(loadSession);

  if (!session) return <Login onLogin={setSession} />;

  const signOut = () => {
    clearSession();
    setSession(null);
  };

  return (
    <div className="app">
      <header>
        <h1>{t().appTitle}</h1>
        <button type="button" className="link" onClick={signOut}>
          {t().signOut}
        </button>
      </header>
      <Harvest session={session} onSessionExpired={signOut} />
      <Export session={session} />
    </div>
  );
}
