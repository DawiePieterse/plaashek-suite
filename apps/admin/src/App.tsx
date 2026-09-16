import { useState } from "react";
import { clearSession, loadSession, type Session } from "./api.js";
import { Devices } from "./Devices.js";
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
      <header className="no-print">
        <h1>Plaashek — Plaaskantoor</h1>
        <button type="button" className="link" onClick={signOut}>
          Meld af
        </button>
      </header>
      <Devices session={session} onSessionExpired={signOut} />
    </div>
  );
}
