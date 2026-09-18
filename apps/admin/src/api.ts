import { createApiClient, type Session } from "@plaashek/ui-office";
import { locale, t } from "./copy.js";

export type { Session };

const BASE = import.meta.env["VITE_API_URL"] ?? "http://localhost:8080";

export const { loadSession, saveSession, clearSession, api, downloadCsv } = createApiClient({
  baseUrl: BASE,
  tokenKey: "plaashek.admin.session",
  errorText: (code) => t().errors[code] ?? t().errors["unknown"],
});

export { ApiError } from "@plaashek/ui-office";

export const formatWhen = (iso: string) => new Date(iso).toLocaleString(locale(), { dateStyle: "short", timeStyle: "short" });

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
