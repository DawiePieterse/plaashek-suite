import { useState } from "react";
import { useFlush, useGpsFix, useSavedToast } from "./capture.js";
import { locale, t } from "./copy.js";
import { enqueue } from "./queue.js";
import { type Claims } from "./ticket.js";

const LAST_PUNCH_KEY = "plaashek.field.span.last";

interface LastPunch {
  direction: "in" | "out";
  at: string;
}

/**
 * What this phone punched last, kept locally because the answer has to be
 * right with no signal — the queue may already be flushed and the server is
 * not reachable to ask. Only ever this phone's own punches, which is the
 * whole of Span (ADR 0008).
 */
function readLastPunch(): LastPunch | null {
  try {
    const raw = globalThis.localStorage?.getItem(LAST_PUNCH_KEY);
    return raw ? (JSON.parse(raw) as LastPunch) : null;
  } catch {
    // A corrupt entry must not white-screen a phone at 05:50 — start from "not clocked in".
    return null;
  }
}

/**
 * Span capture (docs/span-build-scope.md): one button, and it says which way.
 * No weather (a punch is not an observation) and no block picker — a punch is
 * about a person and a clock.
 */
export function Span({ ticket, claims }: { ticket: string; claims: Claims }) {
  const [last, setLast] = useState<LastPunch | null>(readLastPunch);
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
    globalThis.localStorage?.setItem(LAST_PUNCH_KEY, JSON.stringify(punched));
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
