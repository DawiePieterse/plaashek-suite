import { insertStockItem } from "@plaashek/schema";
import { namedCatalogSchemas } from "./catalog.js";

export const { create: createStockItemRequestSchema, update: updateStockItemRequestSchema } = namedCatalogSchemas(
  insertStockItem.shape.name,
  insertStockItem.shape.unit,
);
