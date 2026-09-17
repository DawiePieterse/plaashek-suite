const BASE = import.meta.env["VITE_API_URL"] ?? "http://localhost:8080";
const TOKEN_KEY = "plaashek.management.session";

export interface Session {
  token: string;
  staffId: string;
  email: string;
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

const ERROR_MESSAGES: Record<string, string> = {
  invalid_credentials: "Verkeerde e-pos of wagwoord.",
  unauthenticated: "Jou sessie het verval. Meld weer aan.",
  forbidden: "Jy het nie regte vir hierdie aksie nie.",
  not_found: "Nie gevind nie.",
  validation_error: "Ongeldige inset.",
  unknown: "Iets het verkeerd geloop. Probeer weer.",
};

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
    throw new ApiError(code, ERROR_MESSAGES[code] ?? ERROR_MESSAGES["unknown"]);
  }

  return (await response.json()) as T;
}

export const OFFLINE_MESSAGE = "Kan nie aan die bediener koppel nie.";

export interface Farm {
  farm: { id: string; name: string; language: "af" | "en" };
  organisation: { id: string; name: string };
  entitlements: { moduleCode: string; status: "active" | "grace" | "suspended" | "cancelled" }[];
}
