const BASE = import.meta.env["VITE_API_URL"] ?? "http://localhost:8080";
const TOKEN_KEY = "plaashek.admin.session";

export interface Session {
  token: string;
  farmId: string;
  role: "admin" | "owner";
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

/** Server messages are English (plan §6); the office screen is Afrikaans. */
const MESSAGES: Record<string, string> = {
  invalid_credentials: "Verkeerde e-pos of wagwoord.",
  unauthenticated: "Jou sessie het verval. Meld weer aan.",
  forbidden: "Jy het nie regte vir hierdie aksie nie.",
  not_licensed: "Die plaas het nie 'n lisensie vir hierdie program nie.",
  not_found: "Nie gevind nie.",
  token_used: "Hierdie strokie is reeds geskandeer.",
  token_cancelled: "Hierdie strokie is gekanselleer.",
  token_expired: "Hierdie strokie het verval. Druk 'n nuwe een.",
};

/** Module codes are already the Afrikaans names (plan §4.5) — add a map only if one ever diverges. */
export const moduleName = (code: string) => code.charAt(0).toUpperCase() + code.slice(1);

export const formatWhen = (iso: string) =>
  new Date(iso).toLocaleString("af-ZA", { dateStyle: "short", timeStyle: "short" });

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
    const code = ((await response.json().catch(() => null)) as { error?: { code?: string } } | null)?.error?.code ?? "onbekend";
    throw new ApiError(code, MESSAGES[code] ?? "Iets het verkeerd geloop. Probeer weer.");
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
