import path from "node:path"
import type { Command } from "commander"
import chalk from "chalk"
import { Effect, Exit } from "effect"
import { showAction } from "../actions/show.js"
import type { ReviewResult } from "../core/types.js"
import { CliLive } from "../layers.js"
import { SEVERITY_COLORS } from "../tui/theme.js"
import { exitWithError, extractFailError } from "../util/cli-errors.js"
import { COMMAND_DESCRIPTIONS, COMMON_OPTION_DESCRIPTIONS } from "./metadata.js"

type ShowOptions = {
  json?: boolean
}

export function registerShowCommand(program: Command): void {
  program
    .command("show [file]")
    .description(COMMAND_DESCRIPTIONS.show)
    .option("--json", COMMON_OPTION_DESCRIPTIONS.json)
    .action(async (file: string | undefined, opts: ShowOptions) => {
      const exit = await Effect.runPromiseExit(
        showAction({ filePath: file }).pipe(Effect.provide(CliLive)),
      )

      if (Exit.isFailure(exit)) {
        const err = extractFailError(exit)
        if (err?._tag === "ReviewNotFoundError") {
          exitWithError(
            chalk.red("No review files found. Run a review first with: crev run --schema <name>"),
          )
        }
        if (err?._tag === "FileNotFoundError") {
          exitWithError(chalk.red(`Error: Review file not found: ${err.path}`))
        }
        if (err?._tag === "ReviewParseError") {
          exitWithError(chalk.red("Error: Invalid JSON file"))
        }
        if (err?._tag === "FileReadError") {
          exitWithError(chalk.red(`Error reading review file: ${err.path}`))
        }
        exitWithError(chalk.red(`Error: ${err?._tag ?? "unknown"}`))
      }

      const { filePath, result, isLatest } = exit.value

      if (opts.json) {
        console.log(JSON.stringify(result, null, 2))
        return
      }

      printReview(result, filePath, isLatest)
    })
}

function printReview(result: ReviewResult, filePath: string, isLatest: boolean): void {
  console.log(`\n  ${chalk.bold("Review:")} ${result.metadata.slug}`)
  console.log(`  ${chalk.dim("Schema:")} ${result.metadata.schema}`)
  console.log(`  ${chalk.dim("Date:")} ${result.metadata.timestamp}`)
  console.log(
    `  ${chalk.dim("Diff:")} ${result.metadata.diffType}${result.metadata.diffBase ? ` (base: ${result.metadata.diffBase})` : ""}`,
  )
  if (isLatest) {
    console.log(`  ${chalk.dim("File:")} ${path.relative(process.cwd(), filePath)}`)
  }
  console.log()

  for (const review of result.reviews) {
    console.log(
      `  ${chalk.bold(review.reviewer)} ${chalk.dim(`${review.runtime}/${review.model}`)} ${chalk.dim(`(${(review.durationMs / 1000).toFixed(1)}s)`)}`,
    )

    if (review.issues.length === 0) {
      console.log(`    ${chalk.green("No issues")}`)
    } else {
      for (const issue of review.issues) {
        const colorize = SEVERITY_COLORS[issue.severity] ?? chalk.white
        const location = issue.file
          ? chalk.dim(` ${issue.file}${issue.line ? `:${issue.line}` : ""}`)
          : ""
        const triage = issue.triage ? chalk.dim(` (${issue.triage.verdict})`) : ""

        console.log(`    ${colorize(`[${issue.severity}]`)} ${issue.title}${location}${triage}`)
        if (issue.description) {
          const maxDescWidth = Math.max(40, (process.stdout.columns || 80) - 8)
          const desc =
            issue.description.length > maxDescWidth
              ? issue.description.slice(0, maxDescWidth - 1) + "…"
              : issue.description
          console.log(`      ${chalk.dim(desc)}`)
        }
      }
    }
    console.log()
  }

  console.log(
    `  ${chalk.bold("Summary:")} ${result.summary.totalIssues} issue${result.summary.totalIssues !== 1 ? "s" : ""}`,
  )
  if (result.summary.triage) {
    console.log(
      `    ${chalk.green(`${result.summary.triage.actionable} actionable`)}, ${chalk.yellow(`${result.summary.triage.deferred} deferred`)}, ${chalk.dim(`${result.summary.triage.dismissed} dismissed`)}`,
    )
  }
  console.log()
}
