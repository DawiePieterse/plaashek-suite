import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { auditLog } from "./tables/audit";
import { farms, organisations } from "./tables/core";
import { deviceAssignments, deviceModules, devices, pairingTokens } from "./tables/devices";
import { entitlements } from "./tables/entitlements";
import { assets, blocks, camps, seasons } from "./tables/master-data";
import { farmMemberships, people } from "./tables/people";

export * from "./tables/core";
export * from "./tables/entitlements";
export * from "./tables/people";
export * from "./tables/devices";
export * from "./tables/audit";
export * from "./tables/master-data";
export * from "./workspace-row";

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
