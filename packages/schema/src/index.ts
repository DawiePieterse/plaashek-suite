import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { auditLog } from "./tables/audit.js";
import { productRegistrations, sprayApplications } from "./tables/bespuiting.js";
import { farms, organisations } from "./tables/core.js";
import { deviceAssignments, deviceModules, devices, pairingTokens } from "./tables/devices.js";
import { entitlements } from "./tables/entitlements.js";
import { assets, blocks, camps, seasons } from "./tables/master-data.js";
import { attendancePunches } from "./tables/attendance-punches.js";
import { pieceRates } from "./tables/piecework.js";
import { notes } from "./tables/notes.js";
import { harvestEvents } from "./tables/harvest-events.js";
import { farmMemberships, people } from "./tables/people.js";
import { plaashekStaff } from "./tables/staff.js";
import { stockItems, stockMoves } from "./tables/stock.js";
import { meterReadings, waterPoints } from "./tables/water.js";
import { fuelLogs, workOrders } from "./tables/werkswinkel.js";

export * from "./tables/core.js";
export * from "./tables/entitlements.js";
export * from "./tables/people.js";
export * from "./tables/devices.js";
export * from "./tables/audit.js";
export * from "./tables/master-data.js";
export * from "./tables/notes.js";
export * from "./tables/harvest-events.js";
export * from "./tables/attendance-punches.js";
export * from "./tables/piecework.js";
export * from "./tables/stock.js";
export * from "./tables/water.js";
export * from "./tables/werkswinkel.js";
export * from "./tables/bespuiting.js";
export * from "./tables/staff.js";
export * from "./workspace-row.js";
export * from "./capture-tables.js";

export const insertOrganisation = createInsertSchema(organisations);
export const selectOrganisation = createSelectSchema(organisations);

export const insertFarm = createInsertSchema(farms);
export const selectFarm = createSelectSchema(farms);

export const insertEntitlement = createInsertSchema(entitlements);
export const selectEntitlement = createSelectSchema(entitlements);

export const insertPerson = createInsertSchema(people);
export const selectPerson = createSelectSchema(people);

export const insertFarmMembership = createInsertSchema(farmMemberships);
export const selectFarmMembership = createSelectSchema(farmMemberships);

export const insertDevice = createInsertSchema(devices);
export const selectDevice = createSelectSchema(devices);

export const insertDeviceAssignment = createInsertSchema(deviceAssignments);
export const selectDeviceAssignment = createSelectSchema(deviceAssignments);

export const insertPairingToken = createInsertSchema(pairingTokens);
export const selectPairingToken = createSelectSchema(pairingTokens);

export const insertDeviceModule = createInsertSchema(deviceModules);
export const selectDeviceModule = createSelectSchema(deviceModules);

export const insertAuditLog = createInsertSchema(auditLog);
export const selectAuditLog = createSelectSchema(auditLog);

export const insertBlock = createInsertSchema(blocks);
export const selectBlock = createSelectSchema(blocks);

export const insertCamp = createInsertSchema(camps);
export const selectCamp = createSelectSchema(camps);

export const insertAsset = createInsertSchema(assets);
export const selectAsset = createSelectSchema(assets);

export const insertSeason = createInsertSchema(seasons);
export const selectSeason = createSelectSchema(seasons);

export const insertNote = createInsertSchema(notes);
export const selectNote = createSelectSchema(notes);

export const insertHarvestEvent = createInsertSchema(harvestEvents);
export const selectHarvestEvent = createSelectSchema(harvestEvents);

export const insertAttendancePunch = createInsertSchema(attendancePunches);
export const selectAttendancePunch = createSelectSchema(attendancePunches);

export const insertPieceRate = createInsertSchema(pieceRates);
export const selectPieceRate = createSelectSchema(pieceRates);

export const insertPlaashekStaff = createInsertSchema(plaashekStaff);
export const selectPlaashekStaff = createSelectSchema(plaashekStaff);

export const insertStockItem = createInsertSchema(stockItems);
export const selectStockItem = createSelectSchema(stockItems);

export const insertStockMove = createInsertSchema(stockMoves);
export const selectStockMove = createSelectSchema(stockMoves);

export const insertWaterPoint = createInsertSchema(waterPoints);
export const selectWaterPoint = createSelectSchema(waterPoints);

export const insertMeterReading = createInsertSchema(meterReadings);
export const selectMeterReading = createSelectSchema(meterReadings);

export const insertWorkOrder = createInsertSchema(workOrders);
export const selectWorkOrder = createSelectSchema(workOrders);

export const insertFuelLog = createInsertSchema(fuelLogs);
export const selectFuelLog = createSelectSchema(fuelLogs);

export const insertProductRegistration = createInsertSchema(productRegistrations);
export const selectProductRegistration = createSelectSchema(productRegistrations);

export const insertSprayApplication = createInsertSchema(sprayApplications);
export const selectSprayApplication = createSelectSchema(sprayApplications);
