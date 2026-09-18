import { useState } from "react";
import { Login, OfficeShell } from "@plaashek/ui-office";
import { api, ApiError, clearSession, downloadCsv, loadSession, saveSession, type Session } from "./api.js";
import { setLang, t } from "./copy.js";

/**
 * The Owner Module is the shared office shell (plan §4.2, §4.3) with nothing
 * added: one tab per field module the farm is licensed for, plus Farm
 * settings, and every panel in its read-only form. The owner's own features
 * arrive as `extras` in the same tabs.
 */
export function App() {
  const [session, setSession] = useState<Session | null>(loadSession);
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
      storageKey="plaashek.owner.tab"
    />
  );
}
