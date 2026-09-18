import { z } from "zod";
import { nonEmptyUpdate } from "./catalog.js";

/**
 * The farm's own number for the worker (ADR 0011) — typed by the office, not
 * generated here. Any shape a payroll uses is allowed; only its uniqueness on
 * the farm is ours to enforce.
 */
const workerNumber = z.string().trim().min(1).max(32);
const workerName = z.string().trim().min(1).max(120);

export const createWorkerRequestSchema = z.object({
  workerNumber,
  name: workerName,
});

/** Every field optional: the office edits the one thing that was wrong. */
export const updateWorkerRequestSchema = nonEmptyUpdate(
  z.object({
    workerNumber: workerNumber.optional(),
    name: workerName.optional(),
    /** A worker who has left. Their captures keep their attribution; new scans of the number stop resolving. */
    active: z.boolean().optional(),
  }),
);

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
