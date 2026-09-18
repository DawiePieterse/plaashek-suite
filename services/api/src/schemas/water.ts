import { insertWaterPoint } from "@plaashek/schema";
import { namedCatalogSchemas } from "./catalog.js";

export const { create: createWaterPointRequestSchema, update: updateWaterPointRequestSchema } = namedCatalogSchemas(
  insertWaterPoint.shape.name,
  insertWaterPoint.shape.unit,
);
