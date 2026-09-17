import { useState } from "react";
import { clearSession, loadSession, type Session } from "./api.js";
import { Farms } from "./Farms.js";
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
        <h1>Plaashek Management</h1>
        <button type="button" className="link" onClick={signOut}>
          Meld af
        </button>
      </header>
      <Farms session={session} onSessionExpired={signOut} />
    </div>
  );
}
