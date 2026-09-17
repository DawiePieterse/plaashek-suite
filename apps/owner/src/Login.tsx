import { useState } from "react";
import { api, ApiError, saveSession, type Session } from "./api.js";
import { setLang, t } from "./copy.js";

export function Login({ onLogin }: { onLogin: (session: Session) => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const c = t();

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");

    try {
      const result = await api<Session & { farmMembershipId: string }>("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      const session = { token: result.token, farmId: result.farmId, role: result.role, language: result.language };
      setLang(session.language);
      saveSession(session);
      onLogin(session);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : c.offline);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="login" onSubmit={submit}>
      <h1>{c.appTitle}</h1>

      <label>
        {c.email}
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
      </label>

      <label>
        {c.password}
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
      </label>

      {error && <p className="error">{error}</p>}

      <button type="submit" disabled={busy}>
        {busy ? c.signingIn : c.signIn}
      </button>
    </form>
  );
}
