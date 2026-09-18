const BASE = import.meta.env["VITE_API_URL"] ?? "http://localhost:8080";
const TOKEN_KEY = "plaashek.owner.session";

import { t, type Lang } from "./copy.js";

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

/** CSV comes back as a file, not JSON — fetch it as a blob and hand the browser a download, same auth as `api()`. */
export async function downloadCsv(path: string, token: string, filename: string): Promise<void> {
  const response = await fetch(`${BASE}${path}`, { headers: { authorization: `Bearer ${token}` } });

  if (!response.ok) {
    const code = ((await response.json().catch(() => null)) as { error?: { code?: string } } | null)?.error?.code ?? "unknown";
    throw new ApiError(code, t().errors[code] ?? t().errors["unknown"]);
  }

  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
