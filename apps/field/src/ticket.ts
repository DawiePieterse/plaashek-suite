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

async function request<T>(path: string, init: RequestInit): Promise<T> {
  const response = await fetch(`${API}${path}`, init);

  if (!response.ok) {
    const code = ((await response.json().catch(() => null)) as { error?: { code?: string } } | null)?.error?.code ?? "unknown";
    throw new PairError(code);
  }

  return (await response.json()) as T;
}

const post = <T>(path: string, init?: { ticket?: string; body?: unknown }) =>
  request<T>(path, {
    method: "POST",
    headers: {
      ...(init?.body ? { "content-type": "application/json" } : {}),
      ...(init?.ticket ? { authorization: `Bearer ${init.ticket}` } : {}),
    },
    ...(init?.body ? { body: JSON.stringify(init.body) } : {}),
  });

const get = <T>(path: string, ticket: string) => request<T>(path, { headers: { authorization: `Bearer ${ticket}` } });

/** One-shot: the scan burns the token and mints this device's ticket. */
export const pair = (token: string) => post<{ ticket: string }>(`/pair/${encodeURIComponent(token)}`);

/** Picks up a revoke, a new app, or a dropped licence. Fails offline — that is fine, the stored ticket stands. */
export const refresh = (ticket: string) => post<{ ticket: string }>("/tickets/refresh", { ticket });

/** Sends queued writes. The server stamps farm, device and person — the phone only says what and when. */
export const upload = (ticket: string, ops: unknown[]) =>
  post<{ accepted: string[]; held: boolean }>("/sync/upload", { ticket, body: { ops } });

/** Current weather at a fix, server-proxied. Only called once a GPS fix exists. */
export const fetchWeather = (ticket: string, latitude: number, longitude: number) =>
  get<{ temp: number; humidity: number; condition: string }>(`/weather/current?lat=${latitude}&lon=${longitude}`, ticket);

/** Picker data for Boord's block field — fetched once with signal, cached by the caller. */
export const fetchBlocks = (ticket: string) => get<{ blocks: { id: string; name: string }[] }>("/blocks", ticket);

/** Picker data for Water's meter field and Werkswinkel's equipment field (ADR 0014) — fetched once with signal, cached by the caller. */
export const fetchAssets = (ticket: string) => get<{ assets: { id: string; name: string }[] }>("/assets", ticket);

/** The farm's numbered pickers, so a scan at the scale resolves to a name with no signal (ADR 0009, ADR 0011). */
export const fetchPickers = (ticket: string) =>
  get<{ pickers: { workerNumber: string; personId: string; personName: string }[] }>("/pickers", ticket);
