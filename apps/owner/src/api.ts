import { createApiClient, type Session } from "@plaashek/ui-office";
import { t } from "./copy.js";

export type { Session };

const BASE = import.meta.env["VITE_API_URL"] ?? "http://localhost:8080";

export const { loadSession, saveSession, clearSession, api, downloadCsv } = createApiClient({
  baseUrl: BASE,
  tokenKey: "plaashek.owner.session",
  errorText: (code) => t().errors[code] ?? t().errors["unknown"],
});

export { ApiError } from "@plaashek/ui-office";
