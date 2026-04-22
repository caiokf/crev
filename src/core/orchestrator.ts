import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { getRuntime, type RuntimeExecutionRequest } from "@caiokf/valet"
import chalk from "chalk"
import type { Config } from "./config.js"
import { resolveModelAlias, getRuntimeConfig } from "./config.js"
import { cleanupDiffFile } from "./diff.js"
import { normalizeOutput } from "./normalizer.js"
import { buildResult, writeOutput, mergeAndWriteOutput, formatOutputPath, printSummary } from "./output.js"
import { buildReviewerPrompt, getOutputFormat } from "./prompt.js"
import { withResilience } from "./resilience.js"
import { runTriage } from "./triage.js"
import { UserCancelledError } from "./types.js"
import type { NormalizedReview, ReviewResult, OutputMode, ReviewTarget } from "./types.js"
import type { SchemaFileType, ReviewerConfig } from "../core/schema.js"
import { createMultiSpinner, formatIssueSummary, type MultiSpinnerAction, type MultiSpinnerHandle } from "../tui/multi-spinner.js"
import type { DiffInput } from "@caiokf/valet"
import { uniqueSuffix } from "../util/paths.js"

// Re-export extracted modules for public API
export { buildDiffReference, buildAnalyzeReference, extractChangedFiles, UNTRUSTED_INPUT_WARNING } from "./prompt.js"
export { validateReviewFilePath, recomputeSummary } from "./output.js"

export type OrchestrateOptions = {
  schema: SchemaFileType
  schemaName: string
  schemaHash?: string
  config: Config
  diff: DiffInput
  slug: string
  crevDir: string
  reviewerFilter?: string[]
  analyze?: boolean
  output: OutputMode
  target: ReviewTarget
}

export type PromptOnlyResult = {
  metadata: ReviewResult["metadata"]
  prompts: Array<{
    reviewer: string
    runtime: string
    model: string
    prompt: string
  }>
}

export async function orchestrate(opts: OrchestrateOptions): Promise<ReviewResult> {
  const reviewers = filterReviewers(opts.schema.reviewers, opts.reviewerFilter)

  if (reviewers.length === 0) {
    throw new Error("No reviewers matched the filter")
  }

  const outputFormat = getOutputFormat()
  const timestamp = new Date().toISOString()

  const isQuiet = opts.output.kind === "json" || opts.output.kind === "prompt-only"
  const isPlain = opts.output.kind === "plain"

  if (!isQuiet) {
    const msg = `Running ${reviewers.length} reviewer${reviewers.length > 1 ? "s" : ""} from schema ${opts.schemaName}`
    process.stdout.write(`${msg}\n`)
  }

  const { reviews, spinner } = await executeReviewers(reviewers, opts, outputFormat)

  try {
    await runTriagePass(reviews, opts, spinner)

    spinner?.stop()

    const result = buildResult(reviews, opts, timestamp)

    const output = opts.target.kind === "merge"
      ? { jsonPath: mergeAndWriteOutput(result, opts.target.reviewFile) }
      : writeOutput(result, opts.config, opts.slug, opts.crevDir)

    if (!isQuiet) {
      const displayPath = formatOutputPath(output, opts.config.output.format)
      printSummary(result, displayPath, isPlain)
    }

    cleanupDiffFile(opts.diff)

    return result
  } catch (err) {
    spinner?.stop()
    throw err
  }
}

export function filterReviewers(reviewers: ReviewerConfig[], filter?: string[]): ReviewerConfig[] {
  if (!filter || filter.length === 0) return reviewers

  const filterLower = filter.map((f) => f.toLowerCase().trim())
  if (filterLower.includes("all")) return reviewers

  return reviewers.filter((r) => filterLower.includes(r.name.toLowerCase()))
}

export function buildPromptOnlyResult(opts: OrchestrateOptions): PromptOnlyResult {
  const reviewers = filterReviewers(opts.schema.reviewers, opts.reviewerFilter)
  if (reviewers.length === 0) {
    throw new Error("No reviewers matched the filter")
  }

  const outputFormat = getOutputFormat()
  const timestamp = new Date().toISOString()

  return {
    metadata: {
      slug: opts.slug,
      timestamp,
      schema: opts.schemaName,
      schemaHash: opts.schemaHash,
      diffBase: opts.diff.base,
      diffType: opts.analyze ? "analyze" : opts.diff.type,
      description: opts.target.kind === "fresh" ? opts.target.description : undefined,
    },
    prompts: reviewers.map((reviewer) => {
      const built = buildReviewerPrompt(reviewer, opts.diff, outputFormat, opts.analyze)
      return {
        reviewer: reviewer.name,
        runtime: reviewer.runtime,
        model: built.model,
        prompt: built.fullPrompt,
      }
    }),
  }
}

// ── Reviewer execution ──

type ReviewersResult = {
  reviews: NormalizedReview[]
  spinner: MultiSpinnerHandle | null
}

async function executeReviewers(
  reviewers: ReviewerConfig[],
  opts: OrchestrateOptions,
  outputFormat: string,
): Promise<ReviewersResult> {
  if (opts.output.kind !== "tui") {
    return { reviews: await executeReviewersPlain(reviewers, opts, outputFormat), spinner: null }
  }

  try {
    return await executeReviewersWithTui(reviewers, opts, outputFormat)
  } catch {
    return { reviews: await executeReviewersPlain(reviewers, opts, outputFormat), spinner: null }
  }
}

async function executeReviewersPlain(
  reviewers: ReviewerConfig[],
  opts: OrchestrateOptions,
  outputFormat: string,
): Promise<NormalizedReview[]> {
  const isQuiet = opts.output.kind === "json" || opts.output.kind === "prompt-only"

  const promises = reviewers.map(async (reviewer) => {
    if (!isQuiet) {
      console.log(`Starting: ${reviewer.name} (${reviewer.runtime}/${resolveModelAlias(opts.config, reviewer.model)})`)
    }

    const result = await runSingleReviewer(reviewer, opts, outputFormat)

    if (!isQuiet) {
      const elapsed = (result.durationMs / 1000).toFixed(1)
      const issueCount = result.issues.length
      console.log(`Completed: ${reviewer.name} - ${issueCount} issue${issueCount !== 1 ? "s" : ""} (${elapsed}s)`)
    }

    return result
  })

  const settled = await Promise.allSettled(promises)
  const results: NormalizedReview[] = []
  for (let i = 0; i < settled.length; i++) {
    const entry = settled[i]
    if (entry.status === "fulfilled") {
      results.push(entry.value)
    } else {
      const name = reviewers[i].name
      console.error(`Warning: ${name} failed: ${entry.reason instanceof Error ? entry.reason.message : String(entry.reason)}`)
    }
  }
  return results
}

async function executeReviewersWithTui(
  reviewers: ReviewerConfig[],
  opts: OrchestrateOptions,
  outputFormat: string,
): Promise<ReviewersResult> {
  const abort = new AbortController()
  let action: MultiSpinnerAction = null

  const spinner = createMultiSpinner(
    reviewers.map((r) => ({
      name: r.name,
      detail: `${r.runtime}/${resolveModelAlias(opts.config, r.model)}`,
    })),
  )

  spinner.onAction((a) => {
    action = a
    abort.abort()
  })

  let settled: PromiseSettledResult<NormalizedReview>[]
  try {
    settled = await Promise.allSettled(
      reviewers.map(async (reviewer) => {
        const result = await runSingleReviewer(reviewer, opts, outputFormat, abort.signal)

        if (abort.signal.aborted) return result

        const state = result.exitCode === 0 ? "done" : "failed"
        spinner.updateEntry(reviewer.name, state, {
          elapsed: result.durationMs / 1000,
          resultText: formatIssueSummary(result.issues.length),
        })

        return result
      }),
    )
  } catch (err) {
    spinner.stop()
    throw err
  }

  for (const reviewer of reviewers) {
    const entry = settled[reviewers.indexOf(reviewer)]
    if (entry.status === "rejected" || (entry.status === "fulfilled" && !entry.value)) {
      spinner.updateEntry(reviewer.name, "cancelled")
    }
  }

  if (action === "quit") {
    spinner.stop()
    throw new UserCancelledError()
  }

  if (action === "finalize") {
    spinner.stop()
    console.log(chalk.yellow("Finalizing with completed reviews only."))
  }

  const results: NormalizedReview[] = []
  for (let i = 0; i < settled.length; i++) {
    const entry = settled[i]
    if (entry.status === "fulfilled" && entry.value && entry.value.exitCode === 0) {
      results.push(entry.value)
    } else if (entry.status === "rejected") {
      console.error(`Warning: ${reviewers[i].name} failed: ${entry.reason instanceof Error ? entry.reason.message : String(entry.reason)}`)
    }
  }

  return { reviews: results, spinner: action ? null : spinner }
}

// ── Triage pass ──

async function runTriagePass(
  reviews: NormalizedReview[],
  opts: OrchestrateOptions,
  spinner: MultiSpinnerHandle | null,
): Promise<void> {
  const schemaTriage = opts.schema.triage
  const enabled = schemaTriage?.enabled ?? opts.config.triage.enabled
  if (!enabled) return

  const allIssues = reviews.flatMap((r) => r.issues)
  if (allIssues.length === 0) return

  const effectiveConfig: OrchestrateOptions["config"] = schemaTriage
    ? {
        ...opts.config,
        triage: {
          ...opts.config.triage,
          enabled: true,
          runtime: schemaTriage.runtime ?? opts.config.triage.runtime,
          model: schemaTriage.model ?? opts.config.triage.model,
          deduplicate: schemaTriage.deduplicate ?? opts.config.triage.deduplicate,
          recategorize: schemaTriage.recategorize ?? opts.config.triage.recategorize,
        },
      }
    : opts.config

  const triageDetail = `${effectiveConfig.triage.runtime}/${effectiveConfig.triage.model}`

  const isQuiet = opts.output.kind === "json" || opts.output.kind === "prompt-only"

  if (spinner) {
    spinner.addEntry("Triage", triageDetail)
  } else if (!isQuiet) {
    console.log(`Triage: analyzing ${allIssues.length} issues...`)
  }

  const result = await runTriage({
    issues: allIssues,
    diffContent: opts.diff.diffContent,
    diffType: opts.analyze ? "analyze" : opts.diff.type,
    config: effectiveConfig,
  })

  for (const triaged of result.triaged) {
    const original = allIssues.find((i) => i.id === triaged.id)
    if (!original) continue
    if (triaged.triage) {
      original.triage = triaged.triage
    }
    if (triaged.severity !== original.severity) {
      original.severity = triaged.severity
    }
    if (triaged.category !== original.category) {
      original.category = triaged.category
    }
  }

  const { actionable, deferred, dismissed } = result.summary
  const resultText = `${actionable} actionable, ${deferred} deferred, ${dismissed} dismissed`

  if (spinner) {
    spinner.updateEntry("Triage", "done", {
      elapsed: result.durationMs / 1000,
      resultText,
    })
  } else if (!isQuiet) {
    const elapsed = (result.durationMs / 1000).toFixed(1)
    console.log(`Triage complete: ${resultText} (${elapsed}s)`)
  }
}

// ── Single reviewer execution ──

async function runSingleReviewer(
  reviewer: ReviewerConfig,
  opts: OrchestrateOptions,
  outputFormat: string,
  signal?: AbortSignal,
): Promise<NormalizedReview> {
  const hasFailback = Object.keys(opts.config.failback).length > 0

  if (!hasFailback) {
    return executeReviewer(reviewer, opts, outputFormat, reviewer.runtime, reviewer.model, signal)
  }

  const built = buildReviewerPrompt(reviewer, opts.diff, outputFormat, opts.analyze)
  const baseModel = built.model

  const result = await withResilience(
    (rt, mdl) => executeReviewer(reviewer, opts, outputFormat, rt, mdl, signal),
    reviewer.runtime,
    baseModel,
    opts.config,
    signal,
  )

  if (result.fallback) {
    const fb = result.fallback
    console.error(
      `Warning: ${reviewer.name} fell back from ${fb.originalRuntime}/${fb.originalModel} to ${result.runtime}/${result.model}: ${fb.reason}`,
    )
  }

  return result
}

async function executeReviewer(
  reviewer: ReviewerConfig,
  opts: OrchestrateOptions,
  outputFormat: string,
  runtimeName: string,
  modelName: string,
  signal?: AbortSignal,
): Promise<NormalizedReview> {
  const runtime = getRuntime(runtimeName)
  const model = modelName === "default" ? runtime.defaultModel : modelName
  const built = buildReviewerPrompt(reviewer, opts.diff, outputFormat, opts.analyze)
  const fullPrompt = built.fullPrompt

  const slug = reviewer.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")
  const promptFile = path.join(os.tmpdir(), `crev-prompt-${slug}-${process.pid}-${uniqueSuffix()}.txt`)
  fs.writeFileSync(promptFile, fullPrompt, "utf-8")

  const rtConfig = getRuntimeConfig(opts.config, runtimeName)
  const request: RuntimeExecutionRequest = {
    taskName: reviewer.name,
    model,
    prompt: fullPrompt,
    promptFile,
    diff: opts.diff,
    outputFormat,
    signal,
    overrides: {
      command: rtConfig.command,
      env: rtConfig.env,
      extraArgs: rtConfig.args,
    },
  }

  try {
    const rawResult = await runtime.execute(request)
    return normalizeOutput(reviewer.name, runtimeName, model, rawResult.raw, rawResult.durationMs, rawResult.exitCode, opts.config)
  } finally {
    try { fs.unlinkSync(promptFile) } catch {}
  }
}
