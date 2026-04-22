import fs from "node:fs"
import path from "node:path"
import chalk from "chalk"
import type { Config } from "./config.js"
import { getOutputDir } from "./config.js"
import type { NormalizedReview, ReviewResult } from "./types.js"
import { SEVERITY_ORDER, SEVERITY_COLORS } from "../ui/theme.js"
import { uniqueSuffix } from "../util/paths.js"

import type { OrchestrateOptions } from "./orchestrator.js"

export type OutputPaths = {
  jsonPath: string
  markdownPath?: string
}

export function buildResult(
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

export function writeOutput(result: ReviewResult, config: Config, slug: string, crevDir: string): OutputPaths {
  const outputDir = getOutputDir(config, crevDir)
  fs.mkdirSync(outputDir, { recursive: true })

  const now = new Date()
  const datePart = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
    String(now.getHours()).padStart(2, "0") + String(now.getMinutes()).padStart(2, "0"),
  ].join("-")

  const suffix = uniqueSuffix()
  const basename = `${datePart}-${slug}-${suffix}`
  const jsonPath = path.join(outputDir, `${basename}.json`)

  fs.writeFileSync(jsonPath, JSON.stringify(result, null, 2), "utf-8")

  if (config.output.format === "markdown" || config.output.format === "both") {
    const markdownPath = path.join(outputDir, `${basename}.md`)
    fs.writeFileSync(markdownPath, renderMarkdown(result), "utf-8")
    return { jsonPath, markdownPath }
  }

  return { jsonPath }
}

export function formatOutputPath(paths: OutputPaths, format: Config["output"]["format"]): string {
  const rel = (p: string) => path.relative(process.cwd(), p)
  if (format === "both" && paths.markdownPath) {
    return `${rel(paths.jsonPath)}, ${rel(paths.markdownPath)}`
  }
  if (format === "markdown" && paths.markdownPath) {
    return rel(paths.markdownPath)
  }
  return rel(paths.jsonPath)
}

export function validateReviewFilePath(filePath: string, projectRoot: string): string {
  const resolvedPath = path.resolve(projectRoot, filePath)
  if (!resolvedPath.startsWith(projectRoot + path.sep) && resolvedPath !== projectRoot) {
    throw new Error(`--review-file path "${filePath}" resolves outside the project root`)
  }
  return resolvedPath
}

export function mergeAndWriteOutput(newResult: ReviewResult, existingFilePath: string): string {
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

export function renderMarkdown(result: ReviewResult): string {
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

export function printSummary(result: ReviewResult, outputPath: string, plain?: boolean): void {
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
