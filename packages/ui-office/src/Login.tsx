import { useState } from "react";
import { ApiError, type Session } from "./api-client.js";

export interface LoginCopy {
  appTitle: string;
  email: string;
  password: string;
  signIn: string;
  signingIn: string;
  offline: string;
}

/**
 * The sign-in screen — identical between the Farm Admin Tool and the Owner
 * Module bar the title (plan §4.2, §4.3). Takes its `api` function and
 * copy as props rather than importing an app's own modules, the same way
 * `OfficeShell` takes its dependencies — this is a `packages/ui-office`
 * component, so it cannot reach into `apps/admin` or `apps/owner`.
 */
export function Login({
  onLogin,
  api,
  saveSession,
  setLang,
  copy,
}: {
  onLogin: (session: Session) => void;
  api: <T>(path: string, init?: RequestInit & { token?: string }) => Promise<T>;
  saveSession: (session: Session) => void;
  setLang: (lang: Session["language"]) => void;
  copy: LoginCopy;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");

    try {
      const result = await api<Session & { farmMembershipId: string }>("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      const session: Session = { token: result.token, farmId: result.farmId, role: result.role, language: result.language };
      // Before onLogin: the next render is already this farm's language.
      setLang(session.language);
      saveSession(session);
      onLogin(session);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : copy.offline);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-page">
      <form className="login" onSubmit={submit}>
        <span className="mark" aria-hidden="true">
          P
        </span>
        <h1>{copy.appTitle}</h1>

        <label>
          {copy.email}
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
        </label>

        <label>
          {copy.password}
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </label>

        {error && <p className="error">{error}</p>}

        <button type="submit" disabled={busy}>
          {busy ? copy.signingIn : copy.signIn}
        </button>
      </form>
    </div>
  );
}
