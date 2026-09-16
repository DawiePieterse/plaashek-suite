import { useState } from "react";
import { api, ApiError, saveSession, type Session } from "./api.js";

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
      const result = await api<Session & { farmMembershipId: string }>("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      const session = { token: result.token, farmId: result.farmId, role: result.role };
      saveSession(session);
      onLogin(session);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Kan nie aan die bediener koppel nie.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="login" onSubmit={submit}>
      <h1>Plaashek — Plaaskantoor</h1>

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
  );
}
