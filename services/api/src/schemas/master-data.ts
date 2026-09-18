import { insertAsset, insertBlock, insertCamp, insertPerson } from "@plaashek/schema";
import { z } from "zod";

export const createPersonRequestSchema = z.object({
  name: insertPerson.shape.name,
});

export const createBlockRequestSchema = z.object({
  name: insertBlock.shape.name,
});

export const createCampRequestSchema = z.object({
  name: insertCamp.shape.name,
  blockId: z.string().uuid().optional(),
});

/** Werkswinkel's first build step (docs/werkswinkel-build-scope.md) — assets had a table but no create path. */
export const createAssetRequestSchema = z.object({
  name: insertAsset.shape.name,
});
