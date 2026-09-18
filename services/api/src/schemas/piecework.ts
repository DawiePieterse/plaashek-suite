import { z } from "zod";

export const createWorkerRequestSchema = z.object({
  name: z.string().trim().min(1).max(120),
});

/**
 * Cents, not rand: money never touches a float in this codebase (ADR 0010).
 * The office types rand into the form; the app sends cents.
 */
export const createPieceRateRequestSchema = z
  .object({
    effectiveFrom: z.string().date(),
    baseCentsPerKg: z.number().int().positive(),
    targetKg: z.number().positive().nullable().optional(),
    bonusCentsPerKg: z.number().int().positive().nullable().optional(),
  })
  // Half a tier is a rate nobody can apply — either both sides of it or neither.
  .refine((rate) => (rate.targetKg ?? null) === null === ((rate.bonusCentsPerKg ?? null) === null), {
    message: "targetKg and bonusCentsPerKg must be set together",
  });

/** The pay period the office is asking about. Defaults to the active season's own dates. */
export const payoutQuerySchema = z.object({
  from: z.string().date().optional(),
  to: z.string().date().optional(),
});
