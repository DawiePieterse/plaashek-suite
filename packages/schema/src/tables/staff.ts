import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

/** Plaashek's own staff — a separate cross-farm login, never farm-scoped (plan §3.1, §4.1). */
export const plaashekStaff = pgTable("plaashek_staff", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
