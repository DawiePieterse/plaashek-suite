import { z } from "zod";
import { nonEmptyUpdate } from "./catalog.js";

/**
 * A registration row (docs/bespuiting-build-scope.md) — unlike Stoor's and
 * Water's catalogs, this is not {name, unit}: it is compliance metadata
 * against an existing `stock_items` row, so `item_id` picks the product
 * rather than naming a new one. `withholding_period` is free text, never a
 * number — PPP Info's own values include "28 dae", "Geen", "Geen — nie op
 * vrugte nie", and forcing it into an integer loses that.
 */
export const createProductRegistrationRequestSchema = z.object({
  item_id: z.string().uuid(),
  active_ingredient: z.string().min(1).max(200),
  default_reason: z.string().max(200).nullable().optional(),
  l_number: z.string().max(50).nullable().optional(),
  withholding_period: z.string().max(100).nullable().optional(),
});

export const updateProductRegistrationRequestSchema = nonEmptyUpdate(
  z.object({
    active_ingredient: z.string().min(1).max(200).optional(),
    default_reason: z.string().max(200).nullable().optional(),
    l_number: z.string().max(50).nullable().optional(),
    withholding_period: z.string().max(100).nullable().optional(),
  }),
);
