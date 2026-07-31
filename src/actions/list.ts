import { Effect, Exit } from "effect"
import { getAllRuntimes } from "@caiokf/valet"
import { CrevConfig } from "../services/CrevConfig.js"
import { SchemaStore } from "../services/SchemaStore.js"
import type { ConfigParseError, SchemaInvalidError } from "../errors.js"
import { extractFailError } from "../util/cli-errors.js"

export type SchemaSummary = {
  readonly name: string
  readonly description: string
  readonly reviewers: number
  readonly error?: string
}

export type RuntimeSummary = {
  readonly name: string
  readonly type: string
  readonly models: string[]
  readonly defaultModel: string
}

/**
 * Lists every discoverable schema across user/project/local layers and
 * returns a summary suitable for the CLI `list` view and the TUI
 * schemas table. Individual load failures are captured in the summary's
 * `error` field rather than failing the whole action — one bad schema
 * should not hide the rest.
 */
export const listSchemasAction: Effect.Effect<
  SchemaSummary[],
  ConfigParseError,
  CrevConfig | SchemaStore
> = Effect.gen(function* () {
  const cfg = yield* CrevConfig
  const store = yield* SchemaStore
  const { crevDir, config } = yield* cfg.load()
  const names = yield* store.listAll(crevDir)

  const summaries: SchemaSummary[] = []
  for (const name of names) {
    const resolved = yield* store.resolvePath(name, crevDir)
    if (!resolved) {
      summaries.push({ name, description: "not found", reviewers: 0, error: "unresolved path" })
      continue
    }
    const exit = yield* Effect.exit(store.load(resolved, config.aliases))
    if (Exit.isSuccess(exit)) {
      const schema = exit.value
      summaries.push({
        name,
        description: schema.description ?? "",
        reviewers: schema.reviewers.length,
      })
    } else {
      summaries.push({
        name,
        description: "error loading",
        reviewers: 0,
        error: schemaInvalidReason(extractFailError(exit)),
      })
    }
  }
  return summaries
})

/** Returns all runtimes registered with the valet adapter. */
export const listRuntimesAction: Effect.Effect<RuntimeSummary[]> = Effect.sync(() =>
  getAllRuntimes().map((rt) => ({
    name: rt.name,
    type: rt.type,
    // Prefer the runtime's live catalog (e.g. pi's models store) over the
    // static seed so `crev list` reflects currently available models.
    models: rt.discoverModels?.() ?? [...rt.models],
    defaultModel: rt.defaultModel,
  })),
)

function schemaInvalidReason(err: SchemaInvalidError | undefined): string {
  if (!err) return "unknown error"
  return err.reason
}
