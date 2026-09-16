const BASE = import.meta.env["VITE_API_URL"] ?? "http://localhost:8080";
const TOKEN_KEY = "plaashek.admin.session";

import { locale, t, type Lang } from "./copy.js";

export interface Session {
  token: string;
  farmId: string;
  role: "admin" | "owner";
  language: Lang;
}

export function loadSession(): Session | null {
  try {
    const raw = localStorage.getItem(TOKEN_KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    // Corrupt entry would white-screen the app on load — treat it as signed out.
    return null;
  }
}

export function saveSession(session: Session) {
  localStorage.setItem(TOKEN_KEY, JSON.stringify(session));
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
}

/** Module codes are the module names in both languages (plan §4.5) — add a map only if one ever diverges. */
export const moduleName = (code: string) => code.charAt(0).toUpperCase() + code.slice(1);

export const formatWhen = (iso: string) =>
  new Date(iso).toLocaleString(locale(), { dateStyle: "short", timeStyle: "short" });

export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

export async function api<T>(path: string, init?: RequestInit & { token?: string }): Promise<T> {
  const response = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      ...(init?.body ? { "content-type": "application/json" } : {}),
      ...(init?.token ? { authorization: `Bearer ${init.token}` } : {}),
      ...init?.headers,
    },
  });

  if (!response.ok) {
    const code = ((await response.json().catch(() => null)) as { error?: { code?: string } } | null)?.error?.code ?? "unknown";
    throw new ApiError(code, t().errors[code] ?? t().errors["unknown"]);
  }

  return (await response.json()) as T;
}

export interface FarmContext {
  farm: { id: string; name: string };
  people: { id: string; name: string }[];
  modules: string[];
}

export interface PendingToken {
  id: string;
  moduleCode: string;
  printedAt: string;
  expiresAt: string;
}

export interface Device {
  id: string;
  label: string | null;
  createdAt: string;
  assignedPerson: { personId: string; personName: string } | null;
  modules: string[];
  pendingPairingTokens: PendingToken[];
}

export interface PairingToken extends PendingToken {
  deviceId: string;
  token: string;
  qrUrl: string;
}
