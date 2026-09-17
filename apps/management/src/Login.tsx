import { useState } from "react";
import { api, ApiError, OFFLINE_MESSAGE, saveSession, type Session } from "./api.js";

export function Login({ onLogin }: { onLogin: (session: Session) => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");

    try {
      const session = await api<Session>("/management/login", { method: "POST", body: JSON.stringify({ email, password }) });
      saveSession(session);
      onLogin(session);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : OFFLINE_MESSAGE);
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
        <h1>Plaashek Management</h1>

        <label>
          E-pos
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
        </label>

        <label>
          Wagwoord
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </label>

        {error && <p className="error">{error}</p>}

        <button type="submit" disabled={busy}>
          {busy ? "Wag…" : "Meld aan"}
        </button>
      </form>
    </div>
  );
}
