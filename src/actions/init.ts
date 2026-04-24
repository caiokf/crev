import { Effect } from "effect"
import fs from "node:fs"
import path from "node:path"
import type { RuntimeHealth } from "@caiokf/valet"
import { writeIfNew } from "../util/paths.js"
import { writeSkill } from "../util/skills.js"
import { configTemplate } from "../templates/config.js"
import { quickSchema } from "../templates/schemas/quick.js"
import { standardSchema } from "../templates/schemas/standard.js"
import { thoroughSchema } from "../templates/schemas/thorough.js"
import { collectRuntimeHealth, checkSchemaReadiness } from "../core/health.js"
import type { SchemaReadiness } from "../core/health.js"
import type { AITool } from "../util/detect-tools.js"

export const SCHEMA_TEMPLATES: Record<string, { label: string; content: string }> = {
  quick: { label: "quick       — Fast review (1 reviewer, sonnet)", content: quickSchema },
  standard: { label: "standard    — Balanced review (3 reviewers)", content: standardSchema },
  thorough: { label: "thorough    — Comprehensive (6 reviewers)", content: thoroughSchema },
}

export type InitInput = {
  readonly projectRoot: string
  /** Tools whose skill files should be written into the project. */
  readonly tools: ReadonlyArray<AITool>
  /** Template names to drop into `.crev/schemas/`. Unknown names are ignored. */
  readonly schemaNames: ReadonlyArray<string>
}

export type InitOutput = {
  readonly crevDir: string
  readonly runtimeHealth: RuntimeHealth[]
  readonly schemaReadiness: SchemaReadiness[]
  /** Non-fatal error from the post-scaffold health check, if any. */
  readonly healthError?: string
}

/**
 * Scaffold `.crev/` in `projectRoot`: create directories, drop the
 * starter config + selected schemas, write AI tool skills, then run a
 * health check so the CLI can show ready/not-ready status.
 *
 * Interactive selection lives in the CLI — this action just executes
 * the already-resolved choices so the dash can call it with its own
 * selections.
 */
export const initAction = (
  input: InitInput,
): Effect.Effect<InitOutput, never, never> =>
  Effect.gen(function* () {
    const crevDir = path.join(input.projectRoot, ".crev")

    yield* Effect.sync(() => scaffoldFiles(input.projectRoot, crevDir, input))

    const healthCheck = yield* Effect.tryPromise({
      try: () => collectRuntimeHealth(),
      catch: (cause) => cause instanceof Error ? cause.message : String(cause),
    }).pipe(Effect.either)

    if (healthCheck._tag === "Left") {
      return {
        crevDir,
        runtimeHealth: [],
        schemaReadiness: [],
        healthError: healthCheck.left,
      }
    }

    const runtimeHealth = healthCheck.right
    const schemaReadiness = yield* Effect.sync(() =>
      checkSchemaReadiness(crevDir, runtimeHealth),
    )

    return { crevDir, runtimeHealth, schemaReadiness }
  })

function scaffoldFiles(projectRoot: string, crevDir: string, input: InitInput): void {
  fs.mkdirSync(path.join(crevDir, "schemas"), { recursive: true })
  writeIfNew(path.join(crevDir, "config.yaml"), configTemplate)

  for (const name of input.schemaNames) {
    const schema = SCHEMA_TEMPLATES[name]
    if (schema) {
      writeIfNew(path.join(crevDir, "schemas", `${name}.yaml`), schema.content)
    }
  }

  for (const tool of input.tools) {
    writeSkill(projectRoot, tool)
  }
}
