import { z } from "zod";

export const managementLoginRequestSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const createFarmRequestSchema = z.object({
  organisationName: z.string().min(1),
  farmName: z.string().min(1),
  language: z.enum(["af", "en"]).default("af"),
});

export const setEntitlementRequestSchema = z.object({
  moduleCode: z.string().min(1),
  status: z.enum(["active", "grace", "suspended", "cancelled"]),
});

export const createFarmLoginRequestSchema = z.object({
  personName: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8),
  role: z.enum(["admin", "owner"]),
});
