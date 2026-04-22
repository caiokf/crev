import crypto from "node:crypto"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { getRuntime, type RuntimeExecutionRequest } from "@caiokf/valet"
import chalk from "chalk"
import type { Config } from "./config.js"
import { getOutputDir, loadAgentPrompt, resolveModelAlias, getRuntimeConfig, getOutputFormat } from "./config.js"
import { cleanupDiffFile } from "./diff.js"
import { normalizeOutput } from "./normalizer.js"
import { withResilience } from "./resilience.js"
import { runTriage } from "./triage.js"
import { UserCancelledError } from "./types.js"
import type { NormalizedReview, ReviewResult } from "./types.js"
import type { SchemaFileType, ReviewerConfig } from "../core/schema.js"
import { createMultiSpinner, formatIssueSummary, type MultiSpinnerAction, type MultiSpinnerHandle } from "../ui/multi-spinner.js"
import { SEVERITY_ORDER, SEVERITY_COLORS } from "../ui/theme.js"
import type { DiffInput } from "@caiokf/valet"

export type OrchestrateOptions = {
  schema: SchemaFileType
  schemaName: string
  schemaHash?: string
  config: Config
  diff: DiffInput
  slug: string
  crevDir: string
  description?: string
  reviewerFilter?: string[]
  analyze?: boolean
  plain?: boolean
  promptOnly?: boolean
  silent?: boolean
  reviewFile?: string
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

  if (!opts.plain && !opts.promptOnly && !opts.silent) {
    const msg = `Running ${reviewers.length} reviewer${reviewers.length > 1 ? "s" : ""} from schema ${opts.schemaName}`
    process.stdout.write(`${msg}\n`)
  }

  const { reviews, spinner } = await executeReviewers(reviewers, opts, outputFormat)

  await runTriagePass(reviews, opts, spinner)

  spinner?.stop()

  const result = buildResult(reviews, opts, timestamp)

  const output = opts.reviewFile
    ? { jsonPath: mergeAndWriteOutput(result, opts.reviewFile) }
    : writeOutput(result, opts.config, opts.slug, opts.crevDir)

  if (!opts.promptOnly && !opts.silent) {
    const displayPath = formatOutputPath(output, opts.config.output.format)
    printSummary(result, displayPath, opts.plain)
  }

  cleanupDiffFile(opts.diff)

  return result
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
      description: opts.description,
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

type ReviewersResult = {
  reviews: NormalizedReview[]
  spinner: MultiSpinnerHandle | null
}

async function executeReviewers(
  reviewers: ReviewerConfig[],
  opts: OrchestrateOptions,
  outputFormat: string,
): Promise<ReviewersResult> {
  if (opts.plain || opts.promptOnly || opts.silent) {
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
  const promises = reviewers.map(async (reviewer) => {
    if (!opts.promptOnly && !opts.silent) {
      console.log(`Starting: ${reviewer.name} (${reviewer.runtime}/${resolveModelAlias(opts.config, reviewer.model)})`)
    }

    const result = await runSingleReviewer(reviewer, opts, outputFormat)

    if (!opts.promptOnly && !opts.silent) {
      const elapsed = (result.durationMs / 1000).toFixed(1)
      const issueCount = result.issues.length
      console.log(`Completed: ${reviewer.name} - ${issueCount} issue${issueCount !== 1 ? "s" : ""} (${elapsed}s)`)
    }

    return result
  })

  const settled = await Promise.allSettled(promises)
  const results: NormalizedReview[] = []
  for (const entry of settled) {
    if (entry.status === "fulfilled") {
      results.push(entry.value)
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
  for (const entry of settled) {
    if (entry.status === "fulfilled" && entry.value && entry.value.exitCode === 0) {
      results.push(entry.value)
    }
  }

  return { reviews: results, spinner: action ? null : spinner }
}

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

  // Schema-level triage overrides global config
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

  if (spinner) {
    spinner.addEntry("Triage", triageDetail)
  } else if (!opts.promptOnly && !opts.silent) {
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
  } else if (!opts.promptOnly && !opts.silent) {
    const elapsed = (result.durationMs / 1000).toFixed(1)
    console.log(`Triage complete: ${resultText} (${elapsed}s)`)
  }

}

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
  const promptFile = path.join(os.tmpdir(), `crev-prompt-${slug}-${process.pid}.txt`)
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

function buildReviewerPrompt(
  reviewer: ReviewerConfig,
  diff: DiffInput,
  outputFormat: string,
  analyze?: boolean,
): { model: string; fullPrompt: string } {
  const runtime = getRuntime(reviewer.runtime)
  const model = reviewer.model === "default" ? runtime.defaultModel : reviewer.model

  let prompt = reviewer.prompt ?? "Review the following code changes for issues."
  if (reviewer.agent) {
    const persona = loadAgentPrompt(reviewer.agent)
    if (persona) {
      prompt = `${persona}\n\n---\n\n${prompt}`
    } else {
      console.error(`Warning: Agent file not found for "${reviewer.name}": ${reviewer.agent}`)
    }
  }

  const sourceSection = analyze
    ? buildAnalyzeReference(diff)
    : buildDiffReference(diff.diffFile)

  const promptWithSource = prompt.includes("{{diff}}")
    ? prompt.replaceAll("{{diff}}", () => sourceSection)
    : `${prompt}\n\n${sourceSection}`

  const fullPrompt = [
    promptWithSource,
    "",
    "Respond with valid JSON matching this schema:",
    outputFormat,
  ].join("\n")

  return { model, fullPrompt }
}

export function buildDiffReference(diffFile: string): string {
  return [
    "Review the code changes in this diff file:",
    diffFile,
    "",
    "Read the diff from that file path instead of expecting it to be pasted inline.",
  ].join("\n")
}

export function buildAnalyzeReference(diff: DiffInput): string {
  const files = extractChangedFiles(diff.diffContent)

  return [
    "Review all files in this repository for issues.",
    "This is a full codebase analysis, not a diff review.",
    "",
    "Files to review:",
    ...files.map((f) => `- ${f}`),
    "",
    "Read each file from the filesystem to review its contents.",
  ].join("\n")
}

export function extractChangedFiles(diffContent: string): string[] {
  const files = new Set<string>()
  for (const line of diffContent.split("\n")) {
    if (line.startsWith("diff --git")) {
      const match = line.match(/^diff --git a\/(.+?) b\//)
      if (match) files.add(match[1])
    }
  }
  return [...files]
}

function buildResult(
  reviews: NormalizedReview[],
  opts: OrchestrateOptions,
  timestamp: string,
): ReviewResult {
  return {
    metadata: {
      slug: opts.slug,
      timestamp,
      schema: opts.schemaName,
      schemaHash: opts.schemaHash,
      diffBase: opts.diff.base,
      diffType: opts.analyze ? "analyze" : opts.diff.type,
      description: opts.description,
    },
    reviews,
    summary: recomputeSummary(reviews),
  }
}

type OutputPaths = {
  jsonPath: string
  markdownPath?: string
}

function writeOutput(result: ReviewResult, config: Config, slug: string, crevDir: string): OutputPaths {
  const outputDir = getOutputDir(config, crevDir)
  fs.mkdirSync(outputDir, { recursive: true })

  const now = new Date()
  const datePart = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
    String(now.getHours()).padStart(2, "0") + String(now.getMinutes()).padStart(2, "0"),
  ].join("-")

  const suffix = crypto.randomBytes(3).toString("hex")
  const basename = `${datePart}-${slug}-${suffix}`
  const jsonPath = path.join(outputDir, `${basename}.json`)

  // JSON is the canonical artifact used by other commands (show, stats, merges).
  fs.writeFileSync(jsonPath, JSON.stringify(result, null, 2), "utf-8")

  if (config.output.format === "markdown" || config.output.format === "both") {
    const markdownPath = path.join(outputDir, `${basename}.md`)
    fs.writeFileSync(markdownPath, renderMarkdown(result), "utf-8")
    return { jsonPath, markdownPath }
  }

  return { jsonPath }
}

function formatOutputPath(paths: OutputPaths, format: Config["output"]["format"]): string {
  const rel = (p: string) => path.relative(process.cwd(), p)
  if (format === "both" && paths.markdownPath) {
    return `${rel(paths.jsonPath)}, ${rel(paths.markdownPath)}`
  }
  if (format === "markdown" && paths.markdownPath) {
    return rel(paths.markdownPath)
  }
  return rel(paths.jsonPath)
}

function renderMarkdown(result: ReviewResult): string {
  const lines: string[] = []
  lines.push(`# Review: ${result.metadata.slug}`)
  lines.push("")
  lines.push(`- Schema: ${result.metadata.schema}`)
  lines.push(`- Timestamp: ${result.metadata.timestamp}`)
  lines.push(`- Diff type: ${result.metadata.diffType}`)
  if (result.metadata.diffBase) {
    lines.push(`- Diff base: ${result.metadata.diffBase}`)
  }
  if (result.metadata.description) {
    lines.push(`- Description: ${result.metadata.description}`)
  }

  lines.push("")
  lines.push("## Summary")
  lines.push(`- Total issues: ${result.summary.totalIssues}`)
  if (result.summary.triage) {
    lines.push(`- Actionable: ${result.summary.triage.actionable}`)
    lines.push(`- Deferred: ${result.summary.triage.deferred}`)
    lines.push(`- Dismissed: ${result.summary.triage.dismissed}`)
  } else {
    for (const sev of SEVERITY_ORDER) {
      const count = result.summary.bySeverity[sev]
      if (count) lines.push(`- ${sev}: ${count}`)
    }
  }

  for (const review of result.reviews) {
    lines.push("")
    lines.push(`## ${review.reviewer} (${review.runtime}/${review.model})`)
    lines.push(`- Duration: ${(review.durationMs / 1000).toFixed(1)}s`)

    if (review.issues.length === 0) {
      lines.push("- No issues found")
      continue
    }

    for (const issue of review.issues) {
      const location = issue.file ? ` (${issue.file}${issue.line ? `:${issue.line}` : ""})` : ""
      const triage = issue.triage ? ` [${issue.triage.verdict}]` : ""
      lines.push(`- [${issue.severity}] ${issue.title}${location}${triage}`)
      if (issue.description) {
        lines.push(`  ${issue.description.replace(/\s+/g, " ").trim()}`)
      }
    }
  }

  return lines.join("\n") + "\n"
}

export function validateReviewFilePath(filePath: string, projectRoot: string): string {
  const resolvedPath = path.resolve(projectRoot, filePath)
  if (!resolvedPath.startsWith(projectRoot + path.sep) && resolvedPath !== projectRoot) {
    throw new Error(`--review-file path "${filePath}" resolves outside the project root`)
  }
  return resolvedPath
}

function mergeAndWriteOutput(newResult: ReviewResult, existingFilePath: string): string {
  const resolvedPath = validateReviewFilePath(existingFilePath, process.cwd())

  if (!fs.existsSync(resolvedPath)) {
    fs.mkdirSync(path.dirname(resolvedPath), { recursive: true })
    fs.writeFileSync(resolvedPath, JSON.stringify(newResult, null, 2), "utf-8")
    return resolvedPath
  }

  let existing: ReviewResult
  try {
    const parsed = JSON.parse(fs.readFileSync(resolvedPath, "utf-8"))
    if (!parsed || !Array.isArray(parsed.reviews)) {
      throw new Error("file does not contain a valid ReviewResult (missing reviews array)")
    }
    existing = parsed as ReviewResult
  } catch (err) {
    throw new Error(`--review-file ${existingFilePath} contains invalid JSON: ${err instanceof Error ? err.message : String(err)}`)
  }

  const existingReviewerNames = new Set(existing.reviews.map((r) => r.reviewer))
  const mergedReviews: NormalizedReview[] = [
    ...existing.reviews.map((existingReview) => {
      const newReview = newResult.reviews.find((r) => r.reviewer === existingReview.reviewer)
      if (!newReview) return existingReview
      // Preserve user annotations (e.g., status, triage) from existing issues
      const existingIssueMap = new Map(existingReview.issues.map((i) => [i.id, i]))
      const newIssueIds = new Set(newReview.issues.map((i) => i.id))
      const mergedIssues = [
        ...newReview.issues.map((newIssue) => {
          const existing = existingIssueMap.get(newIssue.id)
          if (existing) {
            if (existing.triage && !newIssue.triage) return { ...newIssue, triage: existing.triage }
          }
          return newIssue
        }),
        // Keep old issues not produced by the new run (preserves user annotations)
        ...existingReview.issues.filter((i) => !newIssueIds.has(i.id)),
      ]
      return { ...newReview, issues: mergedIssues }
    }),
    ...newResult.reviews.filter((r) => !existingReviewerNames.has(r.reviewer)),
  ]

  const merged: ReviewResult = {
    metadata: {
      ...existing.metadata,
      timestamp: newResult.metadata.timestamp,
    },
    reviews: mergedReviews,
    summary: recomputeSummary(mergedReviews),
  }

  fs.writeFileSync(resolvedPath, JSON.stringify(merged, null, 2), "utf-8")
  return resolvedPath
}

export function recomputeSummary(reviews: NormalizedReview[]): ReviewResult["summary"] {
  const allIssues = reviews.flatMap((r) => r.issues)
  const bySeverity: Record<string, number> = {}
  const byCategory: Record<string, number> = {}
  const byReviewer: Record<string, number> = {}

  for (const issue of allIssues) {
    bySeverity[issue.severity] = (bySeverity[issue.severity] ?? 0) + 1
    byCategory[issue.category] = (byCategory[issue.category] ?? 0) + 1
    byReviewer[issue.reviewer] = (byReviewer[issue.reviewer] ?? 0) + 1
  }

  // Recompute triage counts from actual issue data
  const triaged = allIssues.filter((i) => i.triage)
  const triage = triaged.length > 0
    ? {
        actionable: triaged.filter((i) => i.triage?.verdict === "actionable").length,
        deferred: triaged.filter((i) => i.triage?.verdict === "deferred").length,
        dismissed: triaged.filter((i) => i.triage?.verdict === "dismissed").length,
      }
    : undefined

  return { totalIssues: allIssues.length, bySeverity, byCategory, byReviewer, triage }
}


function printSummary(result: ReviewResult, outputPath: string, plain?: boolean): void {
  const { summary } = result
  const allIssues = result.reviews.flatMap((r) => r.issues)

  if (plain) {
    console.log(`\nReview Summary`)
    if (summary.triage) {
      console.log(`  Triaged:`)
      console.log(`    actionable: ${summary.triage.actionable}`)
      console.log(`    deferred: ${summary.triage.deferred}`)
      console.log(`    dismissed: ${summary.triage.dismissed}`)
    } else {
      for (const sev of SEVERITY_ORDER) {
        if (summary.bySeverity[sev]) console.log(`  ${sev}: ${summary.bySeverity[sev]}`)
      }
    }
    console.log(`  Output: ${outputPath}`)
    return
  }

  const BAR = "│"
  const lines: string[] = []

  lines.push(`${BAR}  ${chalk.bold("Review Summary")}`)

  if (summary.totalIssues === 0) {
    lines.push(`${BAR}    ${chalk.green("No issues found!")}`)
  } else if (summary.triage) {
    lines.push(`${BAR}    ${chalk.bold("Triaged")}`)
    lines.push(`${BAR}      ${chalk.green("actionable")}: ${summary.triage.actionable}`)
    lines.push(`${BAR}      ${chalk.yellow("deferred")}: ${summary.triage.deferred}`)
    lines.push(`${BAR}      ${chalk.dim("dismissed")}: ${summary.triage.dismissed}`)

    const actionable = allIssues.filter((i) => i.triage?.verdict === "actionable")
    if (actionable.length > 0) {
      lines.push(`${BAR}    ${chalk.bold("Actionable")}`)
      for (const sev of SEVERITY_ORDER) {
        const count = actionable.filter((i) => i.severity === sev).length
        if (!count) continue
        const colorize = SEVERITY_COLORS[sev] ?? chalk.white
        lines.push(`${BAR}      ${colorize(sev)}: ${count}`)
      }
    }
  } else {
    for (const sev of SEVERITY_ORDER) {
      const count = summary.bySeverity[sev]
      if (!count) continue
      const colorize = SEVERITY_COLORS[sev] ?? chalk.white
      lines.push(`${BAR}    ${colorize(sev)}: ${count}`)
    }
  }

  lines.push(`${BAR}    ${chalk.dim("Output:")} ${chalk.dim(outputPath)}`)
  lines.push(`${BAR}`)

  process.stdout.write(lines.join("\n") + "\n")
}
