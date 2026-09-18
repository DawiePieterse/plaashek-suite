import { insertStockItem } from "@plaashek/schema";
import { z } from "zod";

export const createStockItemRequestSchema = z.object({
  name: insertStockItem.shape.name,
  unit: insertStockItem.shape.unit,
});

/** Every field optional: the office edits the one thing that was wrong. */
export const updateStockItemRequestSchema = z
  .object({
    name: insertStockItem.shape.name.optional(),
    unit: insertStockItem.shape.unit.optional(),
    /** An item nobody stocks any more — its past moves stay real history. */
    active: z.boolean().optional(),
  })
  .refine((body) => Object.keys(body).length > 0, { message: "Nothing to change" });
