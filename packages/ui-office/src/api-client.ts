import type { Lang } from "./copy.js";

/**
 * What a signed-in office session carries — identical between the Farm
 * Admin Tool and the Owner Module (plan §4.2, §4.3): same fields, same
 * shape, only the storage key and the error wording differ per app.
 */
export interface Session {
  token: string;
  farmId: string;
  role: "admin" | "owner";
  language: Lang;
}

export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

/** `attachment; filename="boord.csv"` → `boord.csv`; anything unexpected falls back to a name the browser will accept. */
function filenameFrom(disposition: string | null): string {
  return /filename="?([^";]+)"?/.exec(disposition ?? "")?.[1] ?? "plaashek.csv";
}

/**
 * The fetch wrapper, session storage and CSV download both office apps need
 * — byte-for-byte identical before this, bar the localStorage key and where
 * an error code gets its words. `errorText` resolves a code to that app's
 * own wording (each app's `copy.ts` keeps its own `errors` dictionary), so
 * the translation still happens in the app's language, not here.
 */
export function createApiClient(opts: { baseUrl: string; tokenKey: string; errorText: (code: string) => string }) {
  const { baseUrl, tokenKey, errorText } = opts;

  function loadSession(): Session | null {
    try {
      const raw = localStorage.getItem(tokenKey);
      return raw ? (JSON.parse(raw) as Session) : null;
    } catch {
      // Corrupt entry would white-screen the app on load — treat it as signed out.
      return null;
    }
  }

  function saveSession(session: Session) {
    localStorage.setItem(tokenKey, JSON.stringify(session));
  }

  function clearSession() {
    localStorage.removeItem(tokenKey);
  }

  async function errorFrom(response: Response): Promise<ApiError> {
    const code = ((await response.json().catch(() => null)) as { error?: { code?: string } } | null)?.error?.code ?? "unknown";
    return new ApiError(code, errorText(code));
  }

  async function api<T>(path: string, init?: RequestInit & { token?: string }): Promise<T> {
    const response = await fetch(`${baseUrl}${path}`, {
      ...init,
      headers: {
        ...(init?.body ? { "content-type": "application/json" } : {}),
        ...(init?.token ? { authorization: `Bearer ${init.token}` } : {}),
        ...init?.headers,
      },
    });

    if (!response.ok) throw await errorFrom(response);

    return (await response.json()) as T;
  }

  /**
   * CSV comes back as a file, not JSON — fetch it as a blob and hand the
   * browser a download, same auth as `api()`. The filename is the server's:
   * it sets `content-disposition`, so a farm's files are named in one place
   * rather than here and there.
   */
  async function downloadCsv(path: string, token: string): Promise<void> {
    const response = await fetch(`${baseUrl}${path}`, { headers: { authorization: `Bearer ${token}` } });

    if (!response.ok) throw await errorFrom(response);

    const url = URL.createObjectURL(await response.blob());
    const link = document.createElement("a");
    link.href = url;
    link.download = filenameFrom(response.headers.get("content-disposition"));
    link.click();
    URL.revokeObjectURL(url);
  }

  return { loadSession, saveSession, clearSession, api, downloadCsv };
}
