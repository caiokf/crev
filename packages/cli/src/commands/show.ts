import fs from "node:fs"
import path from "node:path"
import type { Command } from "commander"
import chalk from "chalk"
import { findCrevDir, loadConfig, getOutputDir } from "../core/config.js"
import type { ReviewResult } from "../core/types.js"
import { SEVERITY_COLORS } from "../ui/theme.js"

export function registerShowCommand(program: Command): void {
  program
    .command("show [file]")
    .description("Pretty-print a review artifact (default: latest)")
    .option("--json", "Machine-readable JSON output")
    .action((file, opts) => {
      const crevDir = findCrevDir()
      const filePath = file ? path.resolve(file) : findLatestReview(crevDir)

      if (!filePath) {
        console.error("No review files found. Run a review first with: crev run --schema <name>")
        process.exit(1)
      }

      if (!fs.existsSync(filePath)) {
        console.error(`Error: File not found: ${filePath}`)
        process.exit(1)
      }

      const content = fs.readFileSync(filePath, "utf-8")
      let result: ReviewResult

      try {
        result = JSON.parse(content) as ReviewResult
      } catch {
        console.error("Error: Invalid JSON file")
        process.exit(1)
      }

      if (opts.json) {
        console.log(content)
        return
      }

      console.log(`\n  ${chalk.bold("Review:")} ${result.metadata.slug}`)
      console.log(`  ${chalk.dim("Schema:")} ${result.metadata.schema}`)
      console.log(`  ${chalk.dim("Date:")} ${result.metadata.timestamp}`)
      console.log(`  ${chalk.dim("Diff:")} ${result.metadata.diffType}${result.metadata.diffBase ? ` (base: ${result.metadata.diffBase})` : ""}`)
      if (!file) {
        console.log(`  ${chalk.dim("File:")} ${path.relative(process.cwd(), filePath)}`)
      }
      console.log()

      for (const review of result.reviews) {
        console.log(`  ${chalk.bold(review.reviewer)} ${chalk.dim(`${review.runtime}/${review.model}`)} ${chalk.dim(`(${(review.durationMs / 1000).toFixed(1)}s)`)}`)

        if (review.issues.length === 0) {
          console.log(`    ${chalk.green("No issues")}`)
        } else {
          for (const issue of review.issues) {
            const colorize = SEVERITY_COLORS[issue.severity] ?? chalk.white
            const location = issue.file ? chalk.dim(` ${issue.file}${issue.line ? `:${issue.line}` : ""}`) : ""
            const status = issue.status !== "open" ? chalk.dim(` [${issue.status}]`) : ""
            const triage = issue.triage ? chalk.dim(` (${issue.triage.verdict})`) : ""

            console.log(`    ${colorize(`[${issue.severity}]`)} ${issue.title}${location}${status}${triage}`)
            if (issue.description) {
              console.log(`      ${chalk.dim(issue.description.slice(0, 120))}`)
            }
          }
        }
        console.log()
      }

      // Summary
      console.log(`  ${chalk.bold("Summary:")} ${result.summary.totalIssues} issue${result.summary.totalIssues !== 1 ? "s" : ""}`)
      if (result.summary.triage) {
        console.log(
          `    ${chalk.green(`${result.summary.triage.actionable} actionable`)}, ${chalk.yellow(`${result.summary.triage.deferred} deferred`)}, ${chalk.dim(`${result.summary.triage.dismissed} dismissed`)}`,
        )
      }
      console.log()
    })
}

function findLatestReview(crevDir: string): string | null {
  const config = loadConfig(crevDir)
  const outputDir = getOutputDir(config, crevDir)

  if (!fs.existsSync(outputDir)) return null

  const files = fs.readdirSync(outputDir)
    .filter((f) => f.endsWith(".json") && f !== ".gitkeep")
    .sort()

  if (files.length === 0) return null

  return path.join(outputDir, files[files.length - 1])
}
