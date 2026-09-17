import { doublePrecision, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { workspaceRowColumns } from "../workspace-row.js";

/**
 * Span — clocking (plan §11, docs/span-build-scope.md). The whole record is
 * the stamp plus a direction: `created_by` is the person who clocked, because
 * a phone clocks its own assigned person and nobody else (ADR 0008).
 *
 * Append-only, like notes and crates — plan §7 names punches in that list, so
 * ADR 0006's "a correction is a new capture" applies here unchanged. Hours are
 * derived at read time from the pairs; nothing totalled is stored.
 */
export const attendancePunches = pgTable("attendance_punches", {
  ...workspaceRowColumns,
  /** `in` or `out`. Text, not an enum: a wrong punch is followed by a right one, never migrated away. */
  direction: text("direction").notNull(),
  /** Opportunistic, same GPS warm-up the other capture screens use — never required, never blocks a save. */
  latitude: doublePrecision("latitude"),
  longitude: doublePrecision("longitude"),
  locationAccuracyM: doublePrecision("location_accuracy_m"),
});

export type PunchDirection = "in" | "out";
