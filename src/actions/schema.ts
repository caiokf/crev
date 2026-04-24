import { Effect } from "effect"
import fs from "node:fs"
import path from "node:path"
import { CrevConfig } from "../services/CrevConfig.js"
import { SchemaStore } from "../services/SchemaStore.js"
import { parseSchemaFile, validateAgentRefs } from "../core/schema.js"
import type { SchemaFileType } from "../core/schema.js"
import type { ConfigParseError, SchemaInvalidError, SchemaNotFoundError } from "../errors.js"

export type SchemaDetail = SchemaFileType & {
  readonly name: string
  readonly path: string
}

/**
 * Resolve a schema name to its highest-priority file, then load & parse
 * it. Returns the resolved path alongside the parsed schema so TUI
 * renderers can surface where the definition lives.
 */
export const showSchemaAction = (
  name: string,
): Effect.Effect<
  SchemaDetail,
  SchemaNotFoundError | SchemaInvalidError | ConfigParseError,
  CrevConfig | SchemaStore
> =>
  Effect.gen(function* () {
    const cfg = yield* CrevConfig
    const store = yield* SchemaStore
    const { crevDir } = yield* cfg.load()
    const schemaPath = yield* store.resolveOrFail(name, crevDir)
    const schema = yield* store.load(schemaPath)
    return { name, path: schemaPath, ...schema }
  })

export type ValidationResult = {
  readonly file: string
  readonly valid: boolean
  readonly errors: string[]
}

export type ValidateSchemaInput =
  | { readonly all: true; readonly file?: undefined }
  | { readonly all?: false; readonly file: string }

/**
 * Validate a single schema file (by path) or every discoverable
 * schema (`all: true`). Each result captures parse errors + missing
 * agent file references. The action never fails for invalid schemas
 * — it returns the list so renderers decide how to surface errors.
 */
export const validateSchemaAction = (
  input: ValidateSchemaInput,
): Effect.Effect<ValidationResult[], ConfigParseError, CrevConfig | SchemaStore> =>
  Effect.gen(function* () {
    const cfg = yield* CrevConfig
    const store = yield* SchemaStore
    const { crevDir } = yield* cfg.load()

    if (input.all) {
      const names = yield* store.listAll(crevDir)
      const results: ValidationResult[] = []
      for (const name of names) {
        const resolved = yield* store.resolvePath(name, crevDir)
        if (!resolved) continue
        results.push(yield* validatePath(resolved, crevDir))
      }
      return results
    }

    const file = path.resolve(input.file)
    return [yield* validatePath(file, crevDir)]
  })

// ── helpers ──

const validatePath = (
  schemaPath: string,
  crevDir: string,
): Effect.Effect<ValidationResult> =>
  Effect.promise(async () => {
    const errors: string[] = []

    if (!fs.existsSync(schemaPath)) {
      return { file: schemaPath, valid: false, errors: [`File not found: ${schemaPath}`] }
    }

    try {
      const content = fs.readFileSync(schemaPath, "utf-8")
      const parseResult = parseSchemaFile(content)

      if (!parseResult.success) {
        for (const issue of parseResult.error.issues) {
          errors.push(`${issue.path.join(".")}: ${issue.message}`)
        }
        return { file: schemaPath, valid: false, errors }
      }

      const schema = parseResult.data
      const agentIssues = await validateAgentRefs(schema, { schemaPath, crevDir })
      for (const issue of agentIssues) {
        errors.push(issue.message)
      }

      return { file: schemaPath, valid: errors.length === 0, errors }
    } catch (cause) {
      return {
        file: schemaPath,
        valid: false,
        errors: [cause instanceof Error ? cause.message : String(cause)],
      }
    }
  })
