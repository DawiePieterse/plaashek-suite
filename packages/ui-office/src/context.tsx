import { createContext, useContext } from "react";
import { officeCopy, type Lang, type OfficeCopy } from "./copy.js";
import type { FarmContext } from "./farm-context.js";

/**
 * What a shared panel needs from whichever app is hosting it. Both office
 * tools have their own session storage, their own base URL and their own
 * error dictionary, so the panels take those rather than reaching for a
 * module-global that would tie them to one app.
 */
export interface OfficeSession {
  token: string;
  farmId: string;
  role: "admin" | "owner";
}

export interface OfficeContextValue {
  session: OfficeSession;
  /** Loaded once by the shell before any panel renders — no panel fetches `/farm` again. */
  context: FarmContext;
  /** The host app's fetch wrapper: adds the bearer token, throws its own ApiError with a `code`. */
  api: <T>(path: string, init?: RequestInit & { token?: string }) => Promise<T>;
  /** No filename: the server names the file on `content-disposition`, so a farm's files are named in one place. */
  downloadCsv: (path: string, token: string) => Promise<void>;
  /** The farm's language (plan §6) — the host reads it off the login response. */
  lang: Lang;
  /** The host's translation of an ApiError code, so one wording covers both apps' screens. */
  errorMessage: (caught: unknown) => string;
  /** True when a failed call means the session is gone and the host should sign out. */
  isUnauthenticated: (caught: unknown) => boolean;
  onSessionExpired: () => void;
  /** Re-fetches `/farm` and replaces `context` — for a panel that just wrote to what it answers (master data's people/blocks/camps), so every other panel reading it (the device picker included) sees the change without a reload. */
  refreshFarm: () => Promise<void>;
}

const OfficeContext = createContext<OfficeContextValue | null>(null);

export function OfficeProvider({ value, children }: { value: OfficeContextValue; children: React.ReactNode }) {
  return <OfficeContext.Provider value={value}>{children}</OfficeContext.Provider>;
}

export function useOffice(): OfficeContextValue & { c: OfficeCopy } {
  const value = useContext(OfficeContext);
  if (!value) throw new Error("useOffice outside an OfficeProvider");
  return { ...value, c: officeCopy(value.lang) };
}

/**
 * The load-and-mutate pattern every panel repeats: one error path, one
 * reload, and a session that has expired hands control back to the app
 * instead of showing a panel full of failures.
 */
export function useOfficeLoader() {
  const office = useOffice();

  return async function guard<T>(action: () => Promise<T>, onError: (message: string) => void): Promise<T | undefined> {
    try {
      return await action();
    } catch (caught) {
      if (office.isUnauthenticated(caught)) {
        office.onSessionExpired();
        return undefined;
      }
      onError(office.errorMessage(caught));
      return undefined;
    }
  };
}
