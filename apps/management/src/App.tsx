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
    <>
      <header className="topbar">
        <span className="mark" aria-hidden="true">
          P
        </span>
        <h1>Plaashek Management</h1>
        <span className="who">
          {session.email}
        </span>
        <button type="button" className="link" onClick={signOut}>
          Meld af
        </button>
      </header>
      <main className="app">
        <Farms session={session} onSessionExpired={signOut} />
      </main>
    </>
  );
}
