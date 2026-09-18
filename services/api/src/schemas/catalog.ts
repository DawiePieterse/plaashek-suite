import { z } from "zod";

/** Every "edit one thing" schema in this codebase needs at least one field actually set — stated once rather than re-added per schema. */
export function nonEmptyUpdate<Shape extends z.ZodRawShape>(schema: z.ZodObject<Shape>) {
  return schema.refine((body) => Object.keys(body).length > 0, { message: "Nothing to change" });
}

/**
 * The catalog shape Stoor and Water both are (docs/stoor-build-scope.md,
 * docs/water-build-scope.md): a farm-defined {name, unit, active} list, add
 * and edit. Takes the two Drizzle-derived field schemas so validation stays
 * wired to each table's own column definitions.
 */
export function namedCatalogSchemas(name: z.ZodTypeAny, unit: z.ZodTypeAny) {
  const create = z.object({ name, unit });

  const update = nonEmptyUpdate(
    z.object({
      name: name.optional(),
      unit: unit.optional(),
      /** An item/point nobody uses any more — its past captures stay real history. */
      active: z.boolean().optional(),
    }),
  );

  return { create, update };
}
