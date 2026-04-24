import { Effect } from "effect"
import crypto from "node:crypto"
import { execSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import type { DiffInput } from "@caiokf/valet"
import { CrevConfig } from "../services/CrevConfig.js"
import { autoSelectSchema } from "../core/schema-auto-select.js"
import { cleanupDiffFile, resolveDiff as resolveDiffSync } from "../core/diff.js"
import { buildPromptOnlyResult, orchestrate } from "../core/orchestrator.js"
import type { OrchestrateOptions, PromptOnlyResult } from "../core/orchestrator.js"
import type { ProgressCallback } from "../core/progress.js"
import {
  applyModelOverrides,
  getModelOverrideFormatError,
  loadSchemaFile,
  parseModelOverrides,
  resolveSchemaPath,
  type ModelOverrides,
  type SchemaFileType,
} from "../core/schema.js"
import {
  UserCancelledError as InternalUserCancelledError,
  type ReviewResult,
  type RunCommand,
} from "../core/types.js"
import {
  ConfigParseError,
  DiffResolutionError,
  OrchestrationError,
  RunCancelledError,
  RunValidationError,
  SchemaNotFoundError,
  SchemaInvalidError,
} from "../errors.js"

export type AutoSelection = {
  readonly schema: string
  readonly reasoning: string
}

export type RunActionInput = {
  readonly command: RunCommand
  /**
   * Optional callback invoked with lifecycle events during the run.
   * The dash wires this to drive a live per-reviewer progress view;
   * CLI callers leave it undefined so stdout stays the source of truth.
   */
  readonly onProgress?: ProgressCallback
}

export type RunActionOutput =
  | {
      readonly kind: "empty"
      readonly result: ReviewResult
      readonly autoSelected?: AutoSelection
    }
  | {
      readonly kind: "prompt-only"
      readonly prompts: PromptOnlyResult
      readonly autoSelected?: AutoSelection
    }
  | {
      readonly kind: "completed"
      readonly result: ReviewResult
      readonly autoSelected?: AutoSelection
    }

export type RunActionError =
  | ConfigParseError
  | SchemaNotFoundError
  | SchemaInvalidError
  | RunValidationError
  | DiffResolutionError
  | RunCancelledError
  | OrchestrationError

/**
 * Drive a full review run: resolve schema (with auto-select), load +
 * validate, apply model/reviewer overrides, generate the diff, and
 * dispatch to the existing orchestrator. Callers (CLI today, dash
 * tomorrow) receive a discriminated `RunActionOutput` so they can
 * render without branching on internal state.
 *
 * The existing `orchestrate()` in `core/orchestrator.ts` still does
 * the reviewer-execution + triage + file-write heavy lifting —
 * Task #9 deliberately leaves that code alone so this extraction is
 * small and test-safe.
 */
export const runAction = (
  input: RunActionInput,
): Effect.Effect<RunActionOutput, RunActionError, CrevConfig> =>
  Effect.gen(function* () {
    const cfg = yield* CrevConfig
    const { crevDir, config } = yield* cfg.load()

    const cmd = input.command

    // ── Schema resolution ──
    let resolvedSchemaName = cmd.schema
    let autoSelected: AutoSelection | undefined

    if (cmd.schema === "auto") {
      const selection = yield* Effect.tryPromise({
        try: () => autoSelectSchema(crevDir, config, cmd.diff, cmd.analyze),
        catch: (cause) =>
          new RunValidationError({
            reason: `auto schema selection failed: ${cause instanceof Error ? cause.message : String(cause)}`,
          }),
      })
      resolvedSchemaName = selection.schema
      autoSelected = { schema: selection.schema, reasoning: selection.reasoning }
    }

    const schemaPath = yield* Effect.sync(() =>
      resolveSchemaPath(resolvedSchemaName, crevDir),
    )
    if (!schemaPath) {
      return yield* Effect.fail(
        new SchemaNotFoundError({
          name: resolvedSchemaName,
          searched: [path.join(crevDir, "schemas")],
        }),
      )
    }

    const schemaRaw = yield* Effect.try({
      try: () => fs.readFileSync(schemaPath, "utf-8"),
      catch: (cause) =>
        new SchemaInvalidError({
          path: schemaPath,
          reason: cause instanceof Error ? cause.message : String(cause),
        }),
    })
    const schemaHash = crypto.createHash("sha256").update(schemaRaw).digest("hex").slice(0, 8)

    let schema = yield* Effect.try({
      try: () => loadSchemaFile(schemaPath, config.aliases),
      catch: (cause) =>
        new SchemaInvalidError({
          path: schemaPath,
          reason: cause instanceof Error ? cause.message : String(cause),
        }),
    })

    // ── Model overrides ──
    if (cmd.modelOverrides) {
      const overrides = parseModelOverrides(cmd.modelOverrides)
      const formatError = getModelOverrideFormatError(overrides)
      if (formatError) {
        return yield* Effect.fail(new RunValidationError({ reason: formatError }))
      }
      const reviewerError = getModelOverrideReviewerErrorSync(schema, overrides)
      if (reviewerError) {
        return yield* Effect.fail(new RunValidationError({ reason: reviewerError }))
      }
      schema = applyModelOverrides(schema, overrides)
    }

    // ── Reviewer filter ──
    const filterError = getReviewerFilterErrorSync(schema, cmd.reviewers)
    if (filterError) {
      return yield* Effect.fail(new RunValidationError({ reason: filterError }))
    }

    // ── Slug ──
    const slug =
      cmd.target.kind === "fresh"
        ? cmd.target.slug ?? generateSlug()
        : path.basename(cmd.target.reviewFile, ".json")

    // ── Diff ──
    const diff = yield* Effect.tryPromise({
      try: () =>
        resolveDiffSync({
          slug,
          source: cmd.diff,
          analyze: cmd.analyze,
          exclude: config.diff.exclude,
          crevDir,
        }),
      catch: (cause) =>
        new DiffResolutionError({
          reason: cause instanceof Error ? cause.message : String(cause),
          cause,
        }),
    })

    // ── Empty diff short-circuit (unless prompt-only, which still has value) ──
    if (!diff.diffContent.trim() && cmd.output.kind !== "prompt-only") {
      yield* Effect.sync(() => cleanupDiffFile(diff))
      const empty = buildEmptyResult(resolvedSchemaName, schemaHash, slug, cmd, diff.type)
      return { kind: "empty", result: empty, autoSelected }
    }

    const orchestrateOpts: OrchestrateOptions = {
      schema,
      schemaName: resolvedSchemaName,
      schemaHash,
      config,
      diff,
      slug,
      crevDir,
      reviewerFilter: cmd.reviewers,
      analyze: cmd.analyze,
      output: cmd.output,
      target: cmd.target,
      onProgress: input.onProgress,
    }

    if (cmd.output.kind === "prompt-only") {
      const prompts = yield* Effect.try({
        try: () => buildPromptOnlyResult(orchestrateOpts),
        catch: (cause) =>
          new RunValidationError({
            reason: cause instanceof Error ? cause.message : String(cause),
          }),
      }).pipe(
        Effect.ensuring(Effect.sync(() => cleanupDiffFile(diff))),
      )
      return { kind: "prompt-only", prompts, autoSelected }
    }

    // ── Execute orchestrator (already writes files + prints spinner itself) ──
    const result = yield* Effect.tryPromise({
      try: () => orchestrate(orchestrateOpts),
      catch: (cause) => mapOrchestratorError(cause),
    }).pipe(
      Effect.ensuring(Effect.sync(() => cleanupDiffFile(diff))),
    )

    return { kind: "completed", result, autoSelected }
  })

function mapOrchestratorError(cause: unknown): RunCancelledError | OrchestrationError {
  if (cause instanceof InternalUserCancelledError) {
    return new RunCancelledError({ message: cause.message })
  }
  return new OrchestrationError({
    reason: cause instanceof Error ? cause.message : String(cause),
    cause,
  })
}

function buildEmptyResult(
  schema: string,
  schemaHash: string,
  slug: string,
  cmd: RunCommand,
  diffType: string,
): ReviewResult {
  return {
    metadata: {
      slug,
      timestamp: new Date().toISOString(),
      schema,
      schemaHash,
      diffBase: cmd.diff.kind === "branch" ? cmd.diff.base : undefined,
      diffType,
      description: cmd.target.kind === "fresh" ? cmd.target.description : undefined,
    },
    reviews: [],
    summary: {
      totalIssues: 0,
      bySeverity: {},
      byCategory: {},
      byReviewer: {},
    },
  }
}

function generateSlug(): string {
  try {
    const branch = execSync("git rev-parse --abbrev-ref HEAD", { encoding: "utf-8" }).trim()
    return branch
      .replace(/[^a-zA-Z0-9-]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 50)
  } catch {
    return "review"
  }
}

// ── Validation helpers (pure — reused by the CLI for pre-flight errors) ──

export function getReviewerFilterErrorSync(
  schema: SchemaFileType,
  reviewerFilter?: string[],
): string | null {
  if (!reviewerFilter || reviewerFilter.length === 0) return null

  const normalized = reviewerFilter.map((r) => r.toLowerCase().trim()).filter(Boolean)
  if (normalized.length === 0 || normalized.includes("all")) return null

  const schemaReviewers = schema.reviewers.map((r) => r.name)
  const schemaReviewersSet = new Set(schemaReviewers.map((r) => r.toLowerCase()))
  const hasMatch = normalized.some((name) => schemaReviewersSet.has(name))
  if (hasMatch) return null

  return `No reviewers matched --reviewers. Available reviewers: ${schemaReviewers.join(", ")}`
}

export function getModelOverrideReviewerErrorSync(
  schema: SchemaFileType,
  overrides: ModelOverrides,
): string | null {
  if (overrides.targeted.size === 0) return null

  const schemaReviewers = schema.reviewers.map((r) => r.name)
  const schemaReviewersSet = new Set(schemaReviewers.map((r) => r.toLowerCase()))

  for (const name of overrides.targeted.keys()) {
    if (!schemaReviewersSet.has(name)) {
      return `--model targets unknown reviewer "${name}". Available reviewers: ${schemaReviewers.join(", ")}`
    }
  }

  return null
}
