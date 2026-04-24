import { Context, Effect, Layer } from "effect"
import path from "node:path"
import {
  listAllSchemas as listAllSchemasSync,
  loadSchemaFile as loadSchemaFileSync,
  resolveSchemaPath as resolveSchemaPathSync,
  type SchemaFileType,
} from "../core/schema.js"
import { SchemaInvalidError, SchemaNotFoundError } from "../errors.js"

export interface SchemaStoreService {
  /** All schema names discoverable across user, project, and local layers. */
  readonly listAll: (crevDir: string) => Effect.Effect<string[]>

  /**
   * Resolve a schema name to its highest-priority file path.
   * Returns `null` if nothing matches — use `resolveOrFail` to turn
   * that into a tagged error.
   */
  readonly resolvePath: (
    schemaName: string,
    crevDir: string,
  ) => Effect.Effect<string | null>

  /** Like `resolvePath` but fails with `SchemaNotFoundError`. */
  readonly resolveOrFail: (
    schemaName: string,
    crevDir: string,
  ) => Effect.Effect<string, SchemaNotFoundError>

  /** Parse and validate a schema file by path. */
  readonly load: (
    schemaPath: string,
    aliases?: Record<string, string>,
  ) => Effect.Effect<SchemaFileType, SchemaInvalidError>
}

export class SchemaStore extends Context.Tag("crev/SchemaStore")<
  SchemaStore,
  SchemaStoreService
>() {}

/**
 * Live layer — wraps the existing synchronous helpers in
 * `core/schema.ts`. Those helpers are thoroughly covered by
 * schema.test.ts; this layer adds typed errors.
 */
export const SchemaStoreLive = Layer.succeed(
  SchemaStore,
  SchemaStore.of({
    listAll: (crevDir) => Effect.sync(() => listAllSchemasSync(crevDir)),

    resolvePath: (schemaName, crevDir) =>
      Effect.sync(() => resolveSchemaPathSync(schemaName, crevDir)),

    resolveOrFail: (schemaName, crevDir) =>
      Effect.gen(function* () {
        const resolved = yield* Effect.sync(() =>
          resolveSchemaPathSync(schemaName, crevDir),
        )
        if (!resolved) {
          return yield* Effect.fail(
            new SchemaNotFoundError({
              name: schemaName,
              searched: buildSearchedPaths(schemaName, crevDir),
            }),
          )
        }
        return resolved
      }),

    load: (schemaPath, aliases) =>
      Effect.try({
        try: () => loadSchemaFileSync(schemaPath, aliases),
        catch: (cause) =>
          new SchemaInvalidError({
            path: schemaPath,
            reason: cause instanceof Error ? cause.message : String(cause),
          }),
      }),
  }),
)

/**
 * Test layer — seed with a `{ schemaName: SchemaFileType }` map.
 * Synthetic paths of the form `<crevDir>/schemas/<name>.yaml` are
 * returned from `resolvePath` and keyed for `load`.
 */
export const makeTestSchemaStore = (
  seed: Record<string, SchemaFileType>,
): { layer: Layer.Layer<SchemaStore>; schemas: Map<string, SchemaFileType> } => {
  const schemas = new Map<string, SchemaFileType>(Object.entries(seed))

  const pathOf = (name: string, crevDir: string) =>
    path.join(crevDir, "schemas", `${name}.yaml`)

  const schemaFromPath = (schemaPath: string): string | null => {
    const base = path.basename(schemaPath, path.extname(schemaPath))
    return schemas.has(base) ? base : null
  }

  const layer = Layer.succeed(
    SchemaStore,
    SchemaStore.of({
      listAll: () => Effect.succeed([...schemas.keys()].sort()),

      resolvePath: (schemaName, crevDir) =>
        Effect.succeed(schemas.has(schemaName) ? pathOf(schemaName, crevDir) : null),

      resolveOrFail: (schemaName, crevDir) =>
        schemas.has(schemaName)
          ? Effect.succeed(pathOf(schemaName, crevDir))
          : Effect.fail(
              new SchemaNotFoundError({
                name: schemaName,
                searched: [pathOf(schemaName, crevDir)],
              }),
            ),

      load: (schemaPath) => {
        const name = schemaFromPath(schemaPath)
        if (!name) {
          return Effect.fail(
            new SchemaInvalidError({
              path: schemaPath,
              reason: `No seeded schema at ${schemaPath}`,
            }),
          )
        }
        return Effect.succeed(schemas.get(name) as SchemaFileType)
      },
    }),
  )
  return { layer, schemas }
}

function buildSearchedPaths(schemaName: string, crevDir: string): string[] {
  const dir = path.join(crevDir, "schemas")
  return [
    path.join(dir, `${schemaName}.local.yaml`),
    path.join(dir, `${schemaName}.local.yml`),
    path.join(dir, `${schemaName}.yaml`),
    path.join(dir, `${schemaName}.yml`),
  ]
}
