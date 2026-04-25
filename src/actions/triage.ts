import { Effect } from "effect"
import path from "node:path"
import { runTriage } from "../core/triage.js"
import { recomputeSummary } from "../core/output.js"
import { resolveDiff, cleanupDiffFile } from "../core/diff.js"
import { CrevConfig } from "../services/CrevConfig.js"
import { ReviewStore } from "../services/ReviewStore.js"
import { SchemaStore } from "../services/SchemaStore.js"
import { getOutputDir } from "../core/config.js"
import { resolveSchemaPath } from "../core/schema.js"
import type { ReviewResult } from "../core/types.js"
import type {
  ConfigParseError,
  FileNotFoundError,
  FileReadError,
  FileWriteError,
  ReviewNotFoundError,
  ReviewParseError,
} from "../errors.js"

export type TriageActionInput = {
  /** Explicit review file path. When omitted, uses the latest review. */
  readonly filePath?: string
  /** Override runtime. */
  readonly runtime?: string
  /** Override model. */
  readonly model?: string
  readonly signal?: AbortSignal
}

export type TriageActionOutput = {
  readonly filePath: string
  readonly result: ReviewResult
  readonly summary: { actionable: number; deferred: number; dismissed: number }
  readonly durationMs: number
  /** Set when the triage LLM call failed or returned unparseable output. */
  readonly error?: string
}

export const triageAction = (
  input: TriageActionInput,
): Effect.Effect<
  TriageActionOutput,
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

    // Resolve runtime/model: CLI override > schema triage section > config triage section
    let runtime = input.runtime ?? config.triage.runtime
    let model = input.model ?? config.triage.model
    let deduplicate = config.triage.deduplicate
    let recategorize = config.triage.recategorize

    // Check schema-level triage overrides
    const schemaName = result.metadata.schema
    if (schemaName) {
      const schemaPath = yield* Effect.sync(() => resolveSchemaPath(schemaName, crevDir))
      if (schemaPath) {
        const schema = yield* Effect.either(schemaStore.load(schemaPath, config.aliases))
        if (schema._tag === "Right" && schema.right.triage) {
          const st = schema.right.triage
          runtime = input.runtime ?? st.runtime ?? runtime
          model = input.model ?? st.model ?? model
          deduplicate = st.deduplicate ?? deduplicate
          recategorize = st.recategorize ?? recategorize
        }
      }
    }

    // Re-generate diff from review metadata
    let diffContent = ""
    const isAnalyze = result.metadata.diffType === "analyze"

    if (!isAnalyze) {
      const diffResult = yield* Effect.promise(async () => {
        try {
          const diff = await resolveDiff({
            slug: result.metadata.slug,
            source: result.metadata.diffBase
              ? { kind: "branch", base: result.metadata.diffBase, type: "all" }
              : { kind: "local", type: "all" },
            exclude: config.diff.exclude,
            crevDir,
          })
          const content = diff.diffContent
          cleanupDiffFile(diff)
          return content
        } catch {
          // Diff regeneration can fail (branch deleted, etc.) — triage can
          // still reason about issues from their descriptions alone.
          console.error("Warning: Could not regenerate diff for triage; proceeding without diff context.")
          return ""
        }
      })
      diffContent = diffResult
    }

    const allIssues = result.reviews.flatMap((r) => r.issues)

    const effectiveConfig = {
      ...config,
      triage: {
        ...config.triage,
        enabled: true,
        runtime,
        model,
        deduplicate,
        recategorize,
      },
    }

    const triageResult = yield* Effect.promise(() =>
      runTriage({
        issues: allIssues,
        diffContent,
        diffType: isAnalyze ? "analyze" : result.metadata.diffType,
        config: effectiveConfig,
        signal: input.signal,
      }),
    )

    // Apply triaged results back to each review's issues
    if (triageResult.triaged.length > 0) {
      const triagedMap = new Map(triageResult.triaged.map((t) => [t.id, t]))
      for (const review of result.reviews) {
        review.issues = review.issues.map((issue) => {
          const triaged = triagedMap.get(issue.id)
          if (!triaged) return issue
          return {
            ...issue,
            severity: triaged.severity,
            category: triaged.category,
            triage: triaged.triage ?? issue.triage,
          }
        })
      }
    }

    // Recompute summary with new triage data
    result.summary = recomputeSummary(result.reviews)

    yield* store.save(filePath, result)

    return {
      filePath,
      result,
      summary: triageResult.summary,
      durationMs: triageResult.durationMs,
      error: triageResult.error,
    }
  })
