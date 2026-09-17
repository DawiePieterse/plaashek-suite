import { z } from "zod";

/**
 * What a phone may say about a write. Everything identifying — farm, device,
 * person — is stamped by the server from the ticket, never read from here.
 */
export const uploadRequestSchema = z.object({
  ops: z
    .array(
      z.object({
        entity: z.literal("notes"),
        entity_id: z.string().uuid(),
        /** The phone's clock. Plan §7: veld phones lie about the time; skew handling comes with the sync engine. */
        client_time: z.string().datetime({ offset: true }),
        /** Resolved on the device from its synced season (docs/seasons-and-stamping.md), null when it has none. */
        season_id: z.string().uuid().nullable(),
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
      }),
    )
    .min(1)
    .max(500),
});

export type UploadOp = z.infer<typeof uploadRequestSchema>["ops"][number];
