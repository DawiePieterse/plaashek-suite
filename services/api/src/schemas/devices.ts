import { insertDevice, insertDeviceAssignment, insertPairingToken } from "@plaashek/schema";
import { z } from "zod";

export const addDeviceRequestSchema = z.object({
  personId: insertDeviceAssignment.shape.personId,
  moduleCode: insertPairingToken.shape.moduleCode,
  label: insertDevice.shape.label.optional(),
});

export const addAppRequestSchema = z.object({
  moduleCode: insertPairingToken.shape.moduleCode,
});
