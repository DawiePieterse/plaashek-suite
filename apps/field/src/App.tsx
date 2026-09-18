import { useEffect, useState } from "react";
import { locale, setLang, t } from "./copy.js";
import { Harvest } from "./Harvest.js";
import { Notes } from "./Notes.js";
import { Span } from "./Span.js";
import { Stoor } from "./Stoor.js";
import { readQueue } from "./queue.js";
import { claims, pair, pairTokenFromPath, PairError, readTicket, refresh, saveTicket } from "./ticket.js";

const moduleName = (code: string) => code.charAt(0).toUpperCase() + code.slice(1);

/**
 * Guards against React StrictMode's double effect burning a one-shot token
 * and reporting "al op die foon" — tracks the token itself, not just "any
 * token handled yet", so a later scan in the same tab (no full reload) still
 * pairs instead of silently falling through to whatever ticket is stored.
 */
let pairedToken: string | null = null;

export function App() {
  const [ticket, setTicket] = useState(readTicket);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const c = t();

  useEffect(() => {
    const token = pairTokenFromPath(location.pathname);

    function keep(fresh: { ticket: string }) {
      // Language before state: the next render is already in the farm's language.
      setLang(claims(fresh.ticket).language);
      saveTicket(fresh.ticket);
      setTicket(fresh.ticket);
    }

    if (token && token !== pairedToken) {
      pairedToken = token;
      setBusy(true);
      // Drop the token from the URL first: a reload would re-post a burnt one-shot.
      history.replaceState(null, "", "/");
      pair(token)
        .then(keep)
        .catch((caught) => setError(t().errors[caught instanceof PairError ? caught.code : "offline"] ?? t().errors["unknown"]))
        .finally(() => setBusy(false));
      return;
    }

    const stored = readTicket();
    // No signal is the normal case out in the veld — the stored ticket stands.
    if (stored) refresh(stored).then(keep).catch(() => {});
  }, []);

  if (busy) return <Screen title={c.pairing} />;
  if (error) return <Screen title={c.pairFailed} body={error} />;
  if (!ticket) return <Screen title={c.notPaired} body={c.notPairedBody} />;

  const ticketClaims = claims(ticket);
  const { modules, deviceId, expiresAt } = ticketClaims;

  if (expiresAt < new Date()) return <Screen title={c.ticketExpired} body={c.ticketExpiredBody} />;
  if (modules.length === 0) {
    // Say it plainly: the phone still holds captures nobody can send any more.
    const stranded = readQueue().length;
    return <Screen title={c.noModules} body={stranded > 0 ? c.strandedNotes(stranded) : c.noModulesBody} />;
  }

  // One app on the phone means no picker — the QR already chose (plan §4.4).
  const current = modules.length === 1 ? modules[0] : open;

  if (current) {
    return (
      <>
        {current === "veldnotas" ? (
          <Notes ticket={ticket} claims={ticketClaims} />
        ) : current === "boord" ? (
          <Harvest ticket={ticket} claims={ticketClaims} />
        ) : current === "span" ? (
          <Span ticket={ticket} claims={ticketClaims} />
        ) : current === "stoor" ? (
          <Stoor ticket={ticket} claims={ticketClaims} />
        ) : (
          <Screen title={moduleName(current)} body={c.shellNote} />
        )}
        {modules.length > 1 && (
          <button type="button" className="back" onClick={() => setOpen(null)}>
            {c.back}
          </button>
        )}
      </>
    );
  }

  return (
    <main>
      <ul className="modules">
        {modules.map((code) => (
          <li key={code}>
            <button type="button" onClick={() => setOpen(code)}>
              {moduleName(code)}
            </button>
          </li>
        ))}
      </ul>
      <footer>{c.deviceFooter(deviceId.slice(0, 8), expiresAt.toLocaleDateString(locale()))}</footer>
    </main>
  );
}

function Screen({ title, body }: { title: string; body?: string }) {
  return (
    <main>
      <h1>{title}</h1>
      {body && <p>{body}</p>}
    </main>
  );
}
