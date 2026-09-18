import { z } from "zod";

/** The phone's clock. Plan §7: veld phones lie about the time; skew handling comes with the sync engine. */
const clientTime = z.string().datetime({ offset: true });
/** Resolved on the device from its synced season (docs/seasons-and-stamping.md), null when it has none. */
const seasonId = z.string().uuid().nullable();

const noteOp = z.object({
  entity: z.literal("notes"),
  entity_id: z.string().uuid(),
  client_time: clientTime,
  season_id: seasonId,
  payload: z.object({
    body: z.string().min(1),
    block_id: z.string().uuid().nullable().optional(),
    // Captured once, on the device, at save time — see notes.ts. Never
    // sent on a retry with different values for the same entity_id.
    latitude: z.number().nullable().optional(),
    longitude: z.number().nullable().optional(),
    location_accuracy_m: z.number().nullable().optional(),
    weather_temp: z.number().nullable().optional(),
    weather_humidity: z.number().nullable().optional(),
    weather_condition: z.string().nullable().optional(),
  }),
});

/**
 * Boord capture (docs/boord-reuse-audit.md): block + weight + optional
 * deduction, same weather stamp as notes.
 *
 * `picker_card_code` is the worker number the card scan produced (ADR 0009,
 * ADR 0011). The phone sends only the number — never a person id, even
 * though it resolved one locally to show the picker's name — so the server
 * is the single place a number becomes an attribution. Optional: a farm
 * running Boord without piece-work sends nothing.
 */
const harvestEventOp = z.object({
  entity: z.literal("harvest_events"),
  entity_id: z.string().uuid(),
  client_time: clientTime,
  season_id: seasonId,
  payload: z.object({
    block_id: z.string().uuid(),
    weight_kg: z.number().positive(),
    deduction_kg: z.number().nullable().optional(),
    picker_card_code: z.string().min(1).max(64).nullable().optional(),
    weather_temp: z.number().nullable().optional(),
    weather_humidity: z.number().nullable().optional(),
    weather_condition: z.string().nullable().optional(),
  }),
});

/** Span punch (docs/span-build-scope.md): a direction and, if the phone has a fix, where it happened. The person is the stamp (ADR 0008). */
const attendancePunchOp = z.object({
  entity: z.literal("attendance_punches"),
  entity_id: z.string().uuid(),
  client_time: clientTime,
  season_id: seasonId,
  payload: z.object({
    direction: z.enum(["in", "out"]),
    latitude: z.number().nullable().optional(),
    longitude: z.number().nullable().optional(),
    location_accuracy_m: z.number().nullable().optional(),
  }),
});

/**
 * What a phone may say about a write. Everything identifying — farm, device,
 * person — is stamped by the server from the ticket, never read from here.
 */
export const uploadRequestSchema = z.object({
  ops: z.array(z.discriminatedUnion("entity", [noteOp, harvestEventOp, attendancePunchOp])).min(1).max(500),
});

export type UploadOp = z.infer<typeof uploadRequestSchema>["ops"][number];
export type NoteOp = z.infer<typeof noteOp>;
export type HarvestEventOp = z.infer<typeof harvestEventOp>;
export type AttendancePunchOp = z.infer<typeof attendancePunchOp>;
