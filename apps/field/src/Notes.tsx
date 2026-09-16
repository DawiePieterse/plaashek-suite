import { useEffect, useState } from "react";
import { t } from "./copy.js";
import { enqueue, readQueue, settle } from "./queue.js";
import { PairError, upload, type Claims } from "./ticket.js";

/** Veldnotas capture. One job per screen, save is local and instant (plan §8). */
export function Notes({ ticket, claims }: { ticket: string; claims: Claims }) {
  const [body, setBody] = useState("");
  const [pending, setPending] = useState(readQueue().length);
  const [saved, setSaved] = useState(false);
  const [refused, setRefused] = useState("");
  const c = t();

  async function flush() {
    if (readQueue().length === 0) return;
    try {
      const { accepted } = await upload(ticket, readQueue());
      setPending(settle(accepted).length);
      setRefused("");
    } catch (caught) {
      // The notes stay on the phone either way. No signal is normal and silent;
      // a "no" from the server is not — say it, or the count sits there forever.
      setRefused(caught instanceof PairError ? (c.errors[caught.code] ?? c.errors["unknown"]) : "");
    }
  }

  useEffect(() => {
    void flush();
    // A phone that finds signal at the gate should not need a tap to send.
    globalThis.addEventListener("online", flush);
    return () => globalThis.removeEventListener("online", flush);
  }, []);

  function save(event: React.FormEvent) {
    event.preventDefault();
    setPending(
      enqueue({
        entity: "notes",
        entity_id: crypto.randomUUID(),
        client_time: new Date().toISOString(),
        season_id: claims.seasonId,
        payload: { body },
      }).length,
    );
    setBody("");
    setSaved(true);
    void flush();
  }

  return (
    <main>
      <form onSubmit={save}>
        <label className="field">
          {c.noteLabel}
          <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={6} required autoFocus />
        </label>
        <button type="submit">{c.save}</button>
      </form>

      {saved && <p className="saved">{c.savedOnPhone}</p>}
      {refused && <p className="refused">{refused}</p>}

      <footer>{pending > 0 ? c.waitingToSend(pending) : c.allSent}</footer>
    </main>
  );
}
