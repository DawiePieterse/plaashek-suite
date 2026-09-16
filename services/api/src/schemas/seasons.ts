import { insertSeason } from "@plaashek/schema";
import { z } from "zod";

const name = insertSeason.shape.name;
const date = z.string().date();

export const createSeasonRequestSchema = z.object({
  name,
  startsOn: date,
  endsOn: date,
  isActive: z.boolean().optional(),
});

/** A pick runs late more often than not — dates and the active flag stay editable (plan §4.2). */
export const updateSeasonRequestSchema = z
  .object({
    name: name.optional(),
    startsOn: date.optional(),
    endsOn: date.optional(),
    isActive: z.boolean().optional(),
  })
  .refine((body) => Object.keys(body).length > 0, { message: "Nothing to update" });
