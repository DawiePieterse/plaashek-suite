import { useState } from "react";
import { useFlush, useGpsFix, useSavedToast } from "./capture.js";
import { locale, t } from "./copy.js";
import { enqueue } from "./queue.js";
import { readStored, writeStored } from "./storage.js";
import { type Claims } from "./ticket.js";

const LAST_PUNCH_KEY = "plaashek.field.span.last";

interface LastPunch {
  direction: "in" | "out";
  at: string;
}

/**
 * Span capture (docs/span-build-scope.md): one button, and it says which way.
 * No weather (a punch is not an observation) and no block picker — a punch is
 * about a person and a clock.
 */
export function Span({ ticket, claims }: { ticket: string; claims: Claims }) {
  /**
   * What this phone punched last, kept locally because the answer has to be
   * right with no signal — the queue may already be flushed and the server is
   * not reachable to ask. Only ever this phone's own punches, which is the
   * whole of Span (ADR 0008).
   */
  const [last, setLast] = useState<LastPunch | null>(() => readStored<LastPunch | null>(LAST_PUNCH_KEY, null));
  const [saved, markSaved] = useSavedToast();
  const fixRef = useGpsFix();
  const { pending, setPending, refused, flush } = useFlush(ticket, t().errors);
  const c = t();

  const next: "in" | "out" = last?.direction === "in" ? "out" : "in";

  function punch() {
    const fix = fixRef.current;
    const at = new Date().toISOString();

    setPending(
      enqueue({
        entity: "attendance_punches",
        entity_id: crypto.randomUUID(),
        client_time: at,
        season_id: claims.seasonId,
        payload: {
          direction: next,
          latitude: fix?.latitude ?? null,
          longitude: fix?.longitude ?? null,
          location_accuracy_m: fix?.accuracy ?? null,
        },
      }).length,
    );

    const punched: LastPunch = { direction: next, at };
    writeStored(LAST_PUNCH_KEY, punched);
    setLast(punched);
    markSaved();
    navigator.vibrate?.(60);
    void flush();
  }

  const lastAt = last ? new Date(last.at).toLocaleTimeString(locale(), { hour: "2-digit", minute: "2-digit" }) : null;

  return (
    <main>
      <p className="status">{last ? (last.direction === "in" ? c.clockedInAt(lastAt!) : c.clockedOutAt(lastAt!)) : c.neverClocked}</p>

      <button type="button" className="big" onClick={punch}>
        {next === "in" ? c.clockIn : c.clockOut}
      </button>

      {saved && <p className="saved toast">{c.savedOnPhone}</p>}
      {refused && <p className="refused">{refused}</p>}

      <footer>
        {pending > 0 && <span className="badge">{pending}</span>}
        {pending > 0 ? c.waitingToSend(pending) : c.allSent}
      </footer>
    </main>
  );
}
