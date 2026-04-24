import { Effect } from "effect"
import path from "node:path"
import { runFix, applyFixStatuses, type FixStatus } from "../core/fix.js"
import { CrevConfig } from "../services/CrevConfig.js"
import { ReviewStore } from "../services/ReviewStore.js"
import { SchemaStore } from "../services/SchemaStore.js"
import { getOutputDir } from "../core/config.js"
import { resolveSchemaPath, loadSchemaFile } from "../core/schema.js"
import type { ReviewIssue, ReviewResult } from "../core/types.js"
import type {
  ConfigParseError,
  FileNotFoundError,
  FileReadError,
  FileWriteError,
  ReviewNotFoundError,
  ReviewParseError,
} from "../errors.js"

export type FixInput = {
  /** Explicit review file path. When omitted, uses the latest review. */
  readonly filePath?: string
  /** Fix a single issue by ID. When omitted, fixes all eligible issues. */
  readonly issueId?: string
  /** Include deferred issues (default: actionable only). */
  readonly includeDeferred?: boolean
  /** Override runtime. */
  readonly runtime?: string
  /** Override model. */
  readonly model?: string
  readonly signal?: AbortSignal
  /** Called after each issue finishes. */
  readonly onProgress?: (completed: number, total: number, status: FixStatus) => void
}

export type FixOutput = {
  readonly filePath: string
  readonly result: ReviewResult
  readonly statuses: FixStatus[]
  readonly summary: { fixed: number; failed: number; skipped: number }
  readonly durationMs: number
}

export const fixAction = (
  input: FixInput,
): Effect.Effect<
  FixOutput,
  | ConfigParseError
  | FileNotFoundError
  | FileReadError
  | FileWriteError
  | ReviewNotFoundError
  | ReviewParseError,
  CrevConfig | ReviewStore | SchemaStore
> =>
  Effect.gen(function* () {
    const cfg = yield* CrevConfig
    const store = yield* ReviewStore
    const schemaStore = yield* SchemaStore
    const { config, crevDir } = yield* cfg.load()

    let filePath: string
    let result: ReviewResult

    if (input.filePath) {
      filePath = path.resolve(input.filePath)
      result = yield* store.load(filePath)
    } else {
      const outputDir = getOutputDir(config, crevDir)
      const loaded = yield* store.latest(outputDir)
      filePath = loaded.filePath
      result = loaded.result
    }

    // Resolve runtime/model: CLI override > schema fix section > config fix section > defaults
    let runtime = input.runtime ?? config.fix?.runtime ?? "claude"
    let model = input.model ?? config.fix?.model ?? "sonnet"

    // Check schema-level fix overrides
    const schemaName = result.metadata.schema
    if (schemaName) {
      const schemaPath = yield* Effect.sync(() => resolveSchemaPath(schemaName, crevDir))
      if (schemaPath) {
        const schema = yield* Effect.either(schemaStore.load(schemaPath))
        if (schema._tag === "Right" && schema.right.fix) {
          runtime = input.runtime ?? schema.right.fix.runtime ?? runtime
          model = input.model ?? schema.right.fix.model ?? model
        }
      }
    }

    // Select issues to fix
    const allIssues = result.reviews.flatMap((r) => r.issues)
    let eligible: ReviewIssue[]

    if (input.issueId) {
      // Single issue mode
      const issue = allIssues.find((i) => i.id === input.issueId)
      eligible = issue ? [issue] : []
    } else {
      // Batch mode: filter by triage verdict
      eligible = allIssues.filter((issue) => {
        // Skip already fixed or wont-fix issues
        if (issue.status === "fixed" || issue.status === "wont-fix") return false
        // No triage? Skip (we need enrichment prompts)
        if (!issue.triage) return false
        if (issue.triage.verdict === "actionable") return true
        if (input.includeDeferred && issue.triage.verdict === "deferred") return true
        return false
      })
    }

    const fixResult = yield* Effect.promise(() =>
      runFix({
        issues: eligible,
        runtime,
        model,
        signal: input.signal,
        onProgress: input.onProgress,
      }),
    )

    applyFixStatuses(result, fixResult.statuses)
    yield* store.save(filePath, result)

    return {
      filePath,
      result,
      statuses: fixResult.statuses,
      summary: fixResult.summary,
      durationMs: fixResult.durationMs,
    }
  })
