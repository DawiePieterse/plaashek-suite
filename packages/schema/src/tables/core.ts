import { doublePrecision, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const organisations = pgTable("organisations", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Chosen when the farm is set up. Every screen the farm sees — office and phone — follows it. */
export const farmLanguage = pgEnum("farm_language", ["af", "en"]);

export const farms = pgTable("farms", {
  id: uuid("id").primaryKey().defaultRandom(),
  organisationId: uuid("organisation_id")
    .notNull()
    .references(() => organisations.id),
  name: text("name").notNull(),
  language: farmLanguage("language").notNull().default("af"),
  /**
   * Where the farm is, for the office weather line and any capture that has
   * no GPS fix of its own. Set from the Farm Admin Tool; null until then —
   * weather simply doesn't show, nothing breaks.
   */
  latitude: doublePrecision("latitude"),
  longitude: doublePrecision("longitude"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
