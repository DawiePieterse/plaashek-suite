import { attendancePunches } from "./tables/attendance-punches.js";
import { sprayApplications } from "./tables/bespuiting.js";
import { harvestEvents } from "./tables/harvest-events.js";
import { notes } from "./tables/notes.js";
import { stockMoves } from "./tables/stock.js";
import { meterReadings } from "./tables/water.js";
import { fuelLogs, workOrders } from "./tables/werkswinkel.js";

/**
 * Every table that holds captured field data — one row per capture, each
 * carrying `workspaceRowColumns` (plan §6). A new module registers its table
 * here once, and everything that has to sweep "all captures" follows: the
 * demo seed's wipe, and anything counting or exporting across modules.
 *
 * Workspace rows carry no foreign key to `farms` (plan §6: no cross-farm
 * FKs), so nothing cascades — without this list a new module's rows are
 * quietly missed by every such sweep.
 */
export const captureTables = [notes, harvestEvents, attendancePunches, stockMoves, meterReadings, workOrders, fuelLogs, sprayApplications];

/**
 * The subset that must carry a season. `season_id` is deliberately null for
 * the season-less modules (plan §6 names Werkswinkel and Water — see
 * docs/water-build-scope.md, docs/werkswinkel-build-scope.md), so "captures
 * without a season" is a question only these tables can be asked — counting
 * the others would report a permanent, meaningless backlog to the office.
 */
export const seasonStampedTables = [notes, harvestEvents, attendancePunches, stockMoves, sprayApplications];
