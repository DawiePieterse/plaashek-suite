import { z } from "zod";
import { nonEmptyUpdate } from "./catalog.js";

/** Whatever the farm's tag says — see lib/tag-number.ts for the normalisation applied on the way in. */
const tagNumber = z.string().trim().min(1).max(32);
/** Free text, never a picklist Plaashek maintains (docs/kudde-build-scope.md). */
const sex = z.string().trim().min(1).max(32);
const breed = z.string().trim().min(1).max(100);

export const createAnimalRequestSchema = z.object({
  tagNumber: tagNumber.nullable().optional(),
  sex,
  breed: breed.nullable().optional(),
  birthDate: z.string().date().nullable().optional(),
});

/** Every field optional: the office edits the one thing that was wrong. */
export const updateAnimalRequestSchema = nonEmptyUpdate(
  z.object({
    tagNumber: tagNumber.nullable().optional(),
    sex: sex.optional(),
    breed: breed.nullable().optional(),
    birthDate: z.string().date().nullable().optional(),
    /** A sold or dead animal. Its movements, treatments and weights keep their history. */
    active: z.boolean().optional(),
  }),
);
