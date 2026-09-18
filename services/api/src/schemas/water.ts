import { insertWaterPoint } from "@plaashek/schema";
import { z } from "zod";

export const createWaterPointRequestSchema = z.object({
  name: insertWaterPoint.shape.name,
  unit: insertWaterPoint.shape.unit,
});

/** Every field optional: the office edits the one thing that was wrong. */
export const updateWaterPointRequestSchema = z
  .object({
    name: insertWaterPoint.shape.name.optional(),
    unit: insertWaterPoint.shape.unit.optional(),
    /** A decommissioned point — its past readings stay real history. */
    active: z.boolean().optional(),
  })
  .refine((body) => Object.keys(body).length > 0, { message: "Nothing to change" });
