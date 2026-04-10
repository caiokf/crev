import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { glob } from "glob"
import { getRuntime, type RuntimeExecutionRequest } from "@crev/runtimes"
import chalk from "chalk"
import type { Config } from "./config.js"
import { getOutputDir, loadAgentPrompt, resolveModelAlias, getRuntimeConfig, getOutputFormat } from "./config.js"
import { cleanupDiffFile } from "./diff.js"
import { normalizeOutput } from "./normalizer.js"
import { runTriage } from "./triage.js"
import type { NormalizedReview, ReviewResult } from "./types.js"
import type { SchemaFileType, ReviewerConfig } from "../core/schema.js"
import { createMultiSpinner, formatIssueSummary, type MultiSpinnerAction, type MultiSpinnerHandle } from "../ui/multi-spinner.js"
import { SEVERITY_ORDER, SEVERITY_COLORS } from "../ui/theme.js"
import type { DiffInput } from "@crev/runtimes"

export type OrchestrateOptions = {
  schema: SchemaFileType
  schemaName: string
  config: Config
  diff: DiffInput
  slug: string
  crevDir: string
  description?: string
  reviewerFilter?: string[]
  plain?: boolean
  promptOnly?: boolean
  reviewFile?: string
}

export async function orchestrate(opts: OrchestrateOptions): Promise<ReviewResult> {
  const reviewers = filterReviewers(opts.schema.reviewers, opts.reviewerFilter)

  if (reviewers.length === 0) {
    throw new Error("No reviewers matched the filter")
  }

  const outputFormat = getOutputFormat()
  const timestamp = new Date().toISOString()

  if (!opts.plain && !opts.promptOnly) {
    const msg = `Running ${reviewers.length} reviewer${reviewers.length > 1 ? "s" : ""} from schema ${opts.schemaName}`
    process.stdout.write(`${msg}\n`)
  }

  const { reviews, spinner } = await executeReviewers(reviewers, opts, outputFormat)

  const triageResult = await runTriagePass(reviews, opts, spinner)

  spinner?.stop()

  const result = buildResult(reviews, opts, timestamp, triageResult)

  const outputPath = opts.reviewFile
    ? mergeAndWriteOutput(result, opts.reviewFile)
    : writeOutput(result, opts.config, opts.slug, opts.crevDir)

  if (!opts.promptOnly) {
    const displayPath = path.relative(process.cwd(), outputPath)
    printSummary(result, displayPath, opts.plain)
  }

  cleanupDiffFile(opts.diff)

  return result
}

function filterReviewers(reviewers: ReviewerConfig[], filter?: string[]): ReviewerConfig[] {
  if (!filter || filter.length === 0) return reviewers

  const filterLower = filter.map((f) => f.toLowerCase().trim())
  if (filterLower.includes("all")) return reviewers

  return reviewers.filter((r) => filterLower.includes(r.name.toLowerCase()))
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
  if (opts.plain || opts.promptOnly) {
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
    if (!opts.promptOnly) {
      console.log(`Starting: ${reviewer.name} (${reviewer.runtime}/${resolveModelAlias(opts.config, reviewer.model)})`)
    }

    const result = await runSingleReviewer(reviewer, opts, outputFormat)

    if (!opts.promptOnly) {
      const elapsed = (result.durationMs / 1000).toFixed(1)
      const issueCount = result.issues.length
      console.log(`Completed: ${reviewer.name} - ${issueCount} issue${issueCount !== 1 ? "s" : ""} (${elapsed}s)`)
    }

    return result
  })

  return Promise.all(promises)
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

  const settled = await Promise.allSettled(
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

  for (const reviewer of reviewers) {
    const entry = settled[reviewers.indexOf(reviewer)]
    if (entry.status === "rejected" || (entry.status === "fulfilled" && !entry.value)) {
      spinner.updateEntry(reviewer.name, "cancelled")
    }
  }

  if (action === "quit") {
    spinner.stop()
    console.log(chalk.yellow("Review cancelled. No files saved."))
    process.exit(0)
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

type TriageSummary = { actionable: number; deferred: number; dismissed: number }

async function runTriagePass(
  reviews: NormalizedReview[],
  opts: OrchestrateOptions,
  spinner: MultiSpinnerHandle | null,
): Promise<TriageSummary | undefined> {
  const schemaTriage = opts.schema.triage
  const enabled = schemaTriage?.enabled ?? opts.config.triage.enabled
  if (!enabled) return undefined

  const allIssues = reviews.flatMap((r) => r.issues)
  if (allIssues.length === 0) return undefined

  // Schema-level triage overrides global config
  const effectiveConfig: OrchestrateOptions["config"] = schemaTriage
    ? {
        ...opts.config,
        triage: {
          ...opts.config.triage,
          enabled: true,
          runtime: schemaTriage.runtime ?? opts.config.triage.runtime,
          model: schemaTriage.model ?? opts.config.triage.model,
          context: schemaTriage.context ?? opts.config.triage.context,
        },
      }
    : opts.config

  const triageDetail = `${effectiveConfig.triage.runtime}/${effectiveConfig.triage.model}`

  if (spinner) {
    spinner.addEntry("Triage", triageDetail)
  } else if (!opts.promptOnly) {
    console.log(`Triage: analyzing ${allIssues.length} issues...`)
  }

  const result = await runTriage({
    issues: allIssues,
    diffContent: opts.diff.diffContent,
    config: effectiveConfig,
    crevDir: opts.crevDir,
  })

  for (const triaged of result.triaged) {
    const original = allIssues.find((i) => i.id === triaged.id)
    if (original && triaged.triage) {
      original.triage = triaged.triage
    }
  }

  const { actionable, deferred, dismissed } = result.summary
  const resultText = `${actionable} actionable, ${deferred} deferred, ${dismissed} dismissed`

  if (spinner) {
    spinner.updateEntry("Triage", "done", {
      elapsed: result.durationMs / 1000,
      resultText,
    })
  } else if (!opts.promptOnly) {
    const elapsed = (result.durationMs / 1000).toFixed(1)
    console.log(`Triage complete: ${resultText} (${elapsed}s)`)
  }

  return result.summary
}

async function runSingleReviewer(
  reviewer: ReviewerConfig,
  opts: OrchestrateOptions,
  outputFormat: string,
  signal?: AbortSignal,
): Promise<NormalizedReview> {
  const runtime = getRuntime(reviewer.runtime)
  const model = reviewer.model === "default" ? runtime.defaultModel : reviewer.model

  let prompt = reviewer.prompt ?? "Review the following code changes for issues."

  if (reviewer.agent) {
    const persona = loadAgentPrompt(reviewer.agent)
    if (persona) {
      prompt = `${persona}\n\n---\n\n${prompt}`
    }
  }

  const scope = reviewer.scope ?? "diff"
  const sourceSection = scope === "codebase"
    ? buildCodebaseReference(opts.diff)
    : buildDiffReference(opts.diff.diffFile)

  const contextSection = await resolveContextFiles(reviewer.context)

  const promptWithSource = prompt.includes("{{diff}}")
    ? prompt.replaceAll("{{diff}}", () => sourceSection)
    : `${prompt}\n\n${sourceSection}`

  const fullPrompt = [
    promptWithSource,
    ...(contextSection ? ["", "---", "", "Additional context files:", "", contextSection] : []),
    "",
    "Respond with valid JSON matching this schema:",
    outputFormat,
  ].join("\n")

  const slug = reviewer.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")
  const promptFile = path.join(os.tmpdir(), `crev-prompt-${slug}-${process.pid}.txt`)
  fs.writeFileSync(promptFile, fullPrompt, "utf-8")

  const rtConfig = getRuntimeConfig(opts.config, reviewer.runtime)
  const request: RuntimeExecutionRequest = {
    taskName: reviewer.name,
    model,
    prompt,
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
    return normalizeOutput(reviewer.name, reviewer.runtime, model, rawResult.raw, rawResult.durationMs, rawResult.exitCode, opts.config)
  } finally {
    try { fs.unlinkSync(promptFile) } catch {}
  }
}

export function buildDiffReference(diffFile: string): string {
  return [
    "Review the code changes in this diff file:",
    diffFile,
    "",
    "Read the diff from that file path instead of expecting it to be pasted inline.",
  ].join("\n")
}

export function buildCodebaseReference(diff: DiffInput): string {
  const files = extractChangedFiles(diff.diffContent)

  const sections: string[] = [
    "The diff that triggered this review is at:",
    diff.diffFile,
    "",
    "Read the diff file above for the exact changes.",
    "",
  ]

  const sourceFiles = files.filter((f) => {
    const resolved = path.resolve(f)
    return fs.existsSync(resolved)
  })

  if (sourceFiles.length > 0) {
    sections.push("Full source of the changed files:", "")
    for (const file of sourceFiles) {
      const content = fs.readFileSync(path.resolve(file), "utf-8")
      sections.push(`--- ${file} ---`, content, "")
    }
  }

  return sections.join("\n")
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

async function resolveContextFiles(patterns?: string[]): Promise<string | null> {
  if (!patterns || patterns.length === 0) return null

  const sections: string[] = []

  for (const pattern of patterns) {
    const matches = await glob(pattern, { nodir: true })
    for (const file of matches.sort()) {
      const resolved = path.resolve(file)
      if (fs.existsSync(resolved)) {
        const content = fs.readFileSync(resolved, "utf-8")
        sections.push(`--- ${file} ---`, content, "")
      }
    }
  }

  return sections.length > 0 ? sections.join("\n") : null
}

function buildResult(
  reviews: NormalizedReview[],
  opts: OrchestrateOptions,
  timestamp: string,
  triageSummary?: TriageSummary,
): ReviewResult {
  const allIssues = reviews.flatMap((r) => r.issues)

  const bySeverity: Record<string, number> = {}
  const byCategory: Record<string, number> = {}
  const byReviewer: Record<string, number> = {}

  for (const issue of allIssues) {
    bySeverity[issue.severity] = (bySeverity[issue.severity] ?? 0) + 1
    byCategory[issue.category] = (byCategory[issue.category] ?? 0) + 1
    byReviewer[issue.reviewer] = (byReviewer[issue.reviewer] ?? 0) + 1
  }

  return {
    metadata: {
      slug: opts.slug,
      timestamp,
      schema: opts.schemaName,
      diffBase: opts.diff.base,
      diffType: opts.diff.type,
      description: opts.description,
    },
    reviews,
    summary: {
      totalIssues: allIssues.length,
      bySeverity,
      byCategory,
      byReviewer,
      triage: triageSummary,
    },
  }
}

function writeOutput(result: ReviewResult, config: Config, slug: string, crevDir: string): string {
  const outputDir = getOutputDir(config, crevDir)
  fs.mkdirSync(outputDir, { recursive: true })

  const now = new Date()
  const datePart = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
    String(now.getHours()).padStart(2, "0") + String(now.getMinutes()).padStart(2, "0"),
  ].join("-")

  const filename = `${datePart}-${slug}.json`
  const filePath = path.join(outputDir, filename)

  fs.writeFileSync(filePath, JSON.stringify(result, null, 2), "utf-8")
  return filePath
}

function mergeAndWriteOutput(newResult: ReviewResult, existingFilePath: string): string {
  const resolvedPath = path.resolve(process.cwd(), existingFilePath)

  if (!fs.existsSync(resolvedPath)) {
    fs.mkdirSync(path.dirname(resolvedPath), { recursive: true })
    fs.writeFileSync(resolvedPath, JSON.stringify(newResult, null, 2), "utf-8")
    return resolvedPath
  }

  const existing = JSON.parse(fs.readFileSync(resolvedPath, "utf-8")) as ReviewResult

  const existingReviewerNames = new Set(existing.reviews.map((r) => r.reviewer))
  const mergedReviews: NormalizedReview[] = [
    ...existing.reviews.map((existingReview) => {
      const newReview = newResult.reviews.find((r) => r.reviewer === existingReview.reviewer)
      if (!newReview) return existingReview
      // Preserve user annotations (e.g., status: "wont-fix") from existing issues
      const existingIssueMap = new Map(existingReview.issues.map((i) => [i.id, i]))
      const mergedIssues = newReview.issues.map((newIssue) => {
        const existing = existingIssueMap.get(newIssue.id)
        if (existing?.status) return { ...newIssue, status: existing.status }
        return newIssue
      })
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
    summary: recomputeSummary(mergedReviews, newResult.summary.triage),
  }

  fs.writeFileSync(resolvedPath, JSON.stringify(merged, null, 2), "utf-8")
  return resolvedPath
}

function recomputeSummary(
  reviews: NormalizedReview[],
  triage?: ReviewResult["summary"]["triage"],
): ReviewResult["summary"] {
  const allIssues = reviews.flatMap((r) => r.issues)
  const bySeverity: Record<string, number> = {}
  const byCategory: Record<string, number> = {}
  const byReviewer: Record<string, number> = {}

  for (const issue of allIssues) {
    bySeverity[issue.severity] = (bySeverity[issue.severity] ?? 0) + 1
    byCategory[issue.category] = (byCategory[issue.category] ?? 0) + 1
    byReviewer[issue.reviewer] = (byReviewer[issue.reviewer] ?? 0) + 1
  }

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
