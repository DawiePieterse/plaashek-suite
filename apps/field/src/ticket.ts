import type { Lang } from "./copy.js";

const API = import.meta.env?.["VITE_API_URL"] ?? "http://localhost:8080";
const TICKET_KEY = "plaashek.field.ticket";

export interface Claims {
  farmId: string;
  deviceId: string;
  modules: string[];
  /** The farm's screen language, chosen when the farm was set up. */
  language: Lang;
  /** The farm's active season — what this phone stamps captures with, offline (docs/seasons-and-stamping.md). */
  seasonId: string | null;
  expiresAt: Date;
}

/**
 * Reads the ticket's own claims for display — which tiles to draw, when the
 * phone goes quiet. Not a verification: the server checks the signature on
 * every sync, and a device that lies to itself only lies about its own screen.
 */
export function claims(ticket: string): Claims {
  const payload = JSON.parse(atob(ticket.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));

  return {
    farmId: payload.farm_id,
    deviceId: payload.sub,
    modules: payload.modules ?? [],
    language: payload.lang === "en" ? "en" : "af",
    seasonId: payload.season ?? null,
    expiresAt: new Date(payload.exp * 1000),
  };
}

/** The printed slip's URL is `…/pair/<token>` (plan §3.4). */
export function pairTokenFromPath(path: string): string | null {
  const match = /^\/pair\/([^/?#]+)/.exec(path);
  return match ? decodeURIComponent(match[1]) : null;
}

export function readTicket(): string | null {
  return localStorage.getItem(TICKET_KEY);
}

export function saveTicket(ticket: string) {
  localStorage.setItem(TICKET_KEY, ticket);
}

/** A server "no", carrying the error code the screen has copy for. Anything else thrown here is signal trouble. */
export class PairError extends Error {
  code: string;

  constructor(code: string) {
    super(code);
    this.code = code;
  }
}

async function post<T>(path: string, init?: { ticket?: string; body?: unknown }): Promise<T> {
  const response = await fetch(`${API}${path}`, {
    method: "POST",
    headers: {
      ...(init?.body ? { "content-type": "application/json" } : {}),
      ...(init?.ticket ? { authorization: `Bearer ${init.ticket}` } : {}),
    },
    ...(init?.body ? { body: JSON.stringify(init.body) } : {}),
  });

  if (!response.ok) {
    const code = ((await response.json().catch(() => null)) as { error?: { code?: string } } | null)?.error?.code ?? "unknown";
    throw new PairError(code);
  }

  return (await response.json()) as T;
}

/** One-shot: the scan burns the token and mints this device's ticket. */
export const pair = (token: string) => post<{ ticket: string }>(`/pair/${encodeURIComponent(token)}`);

/** Picks up a revoke, a new app, or a dropped licence. Fails offline — that is fine, the stored ticket stands. */
export const refresh = (ticket: string) => post<{ ticket: string }>("/tickets/refresh", { ticket });

/** Sends queued writes. The server stamps farm, device and person — the phone only says what and when. */
export const upload = (ticket: string, ops: unknown[]) =>
  post<{ accepted: string[]; held: boolean }>("/sync/upload", { ticket, body: { ops } });
