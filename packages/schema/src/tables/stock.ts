import { boolean, doublePrecision, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { workspaceRowColumns } from "../workspace-row.js";
import { farms } from "./core.js";
import { blocks } from "./master-data.js";

/**
 * Stoor's catalog (plan §11, docs/stoor-build-scope.md) — master data, like
 * blocks and camps: the office defines an item once, in whatever unit it
 * already counts it in, and every move just names the item and a quantity.
 * `active` retires an item without deleting the moves already logged
 * against it, the same reasoning ADR 0011 used for a worker who has left.
 */
export const stockItems = pgTable("stock_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  farmId: uuid("farm_id")
    .notNull()
    .references(() => farms.id),
  name: text("name").notNull(),
  /** Whatever the farm already calls it — "L", "kg", "bag" — free text, never enforced. */
  unit: text("unit").notNull(),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * One receipt or one use of an item — stock on hand (docs/stoor-build-scope.md)
 * is derived from this ledger, never stored. Append-only like every other
 * capture: a miscounted move is followed by a correcting one, not edited away.
 */
export const stockMoves = pgTable("stock_moves", {
  ...workspaceRowColumns,
  itemId: uuid("item_id")
    .notNull()
    .references(() => stockItems.id),
  /** `in` (received) or `out` (used/issued). */
  direction: text("direction").notNull(),
  quantity: doublePrecision("quantity").notNull(),
  /** Where it went — meaningful on an `out` move, never required (plan §8). */
  blockId: uuid("block_id").references(() => blocks.id),
  /** Free text — a supplier on receipt, a reason on use. */
  note: text("note"),
});
