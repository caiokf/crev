import type { Command } from "commander"
import chalk from "chalk"
import path from "node:path"
import { Effect } from "effect"
import { statsAction } from "../actions/stats.js"
import type { ReviewerStats, RevisionGroup } from "../actions/stats.js"
import { CliLive } from "../layers.js"
import { exitWithError } from "../util/cli-errors.js"
import { COMMAND_DESCRIPTIONS, COMMON_OPTION_DESCRIPTIONS } from "./metadata.js"

// Re-exported so existing imports (e.g. stats.test.ts) keep working.
export {
  clusterDismissedTitles,
  normalizeTitle,
  titlesAreSimilar,
} from "../actions/stats.js"

type StatsOptions = {
  schema?: string
  history?: boolean
  json?: boolean
}

export function registerStatsCommand(program: Command): void {
  program
    .command("stats")
    .description(COMMAND_DESCRIPTIONS.stats)
    .option("--schema <name>", "Filter by schema name")
    .option("--history", "Show all schema revisions with comparison deltas")
    .option("--json", COMMON_OPTION_DESCRIPTIONS.json)
    .action(async (opts: StatsOptions) => {
      const data = await Effect.runPromise(
        statsAction({ schema: opts.schema }).pipe(Effect.provide(CliLive)),
      )

      if (data.skippedFiles.length > 0) {
        const detail =
          data.skippedFiles.length <= 5
            ? data.skippedFiles.map((f) => path.basename(f)).join(", ")
            : `${data.skippedFiles.slice(0, 5).map((f) => path.basename(f)).join(", ")} and ${data.skippedFiles.length - 5} more`
        console.error(
          chalk.yellow(
            `Warning: skipped ${data.skippedFiles.length} invalid review file${data.skippedFiles.length !== 1 ? "s" : ""}: ${detail}`,
          ),
        )
      }

      if (data.totalLoaded === 0) {
        exitWithError(
          chalk.red("No review files found. Run a review first with: crev run --schema <name>"),
        )
      }

      if (Object.keys(data.bySchema).length === 0) {
        if (opts.schema) {
          exitWithError(chalk.red(`No reviews found for schema "${opts.schema}"`))
        }
        exitWithError(
          chalk.red("No valid review files found. Run a review first with: crev run --schema <name>"),
        )
      }

      if (opts.json) {
        console.log(JSON.stringify(data.bySchema, null, 2))
        return
      }

      for (const [schema, { revisions }] of Object.entries(data.bySchema)) {
        if (opts.history) {
          printHistory(schema, revisions)
        } else {
          const latest = revisions[revisions.length - 1]
          printRevision(schema, latest, true)
        }
      }
    })
}

function printHistory(schema: string, revisions: RevisionGroup[]): void {
  console.log()
  console.log(
    `  ${chalk.bold(`Schema: ${schema}`)} — ${revisions.length} revision${revisions.length !== 1 ? "s" : ""}, ${revisions.reduce((s, r) => s + r.runs, 0)} runs total`,
  )
  console.log()

  for (let i = 0; i < revisions.length; i++) {
    const rev = revisions[i]
    const isCurrent = i === revisions.length - 1
    const label = isCurrent ? ` ${chalk.green("← current")}` : ""

    console.log(
      `  ${chalk.bold(`Revision ${i + 1}`)}  ${chalk.dim(`(${rev.schemaHash})`)}  ${rev.runs} run${rev.runs !== 1 ? "s" : ""}   ${formatDateRange(rev.firstDate, rev.lastDate)}${label}`,
    )

    const cols = process.stdout.columns ?? 80
    console.log(`  ${chalk.dim("─".repeat(Math.max(0, Math.min(60, cols - 4))))}`)

    if (!rev.hasTriage) {
      console.log(`  ${chalk.dim("Note: no triage configured")}`)
      console.log()
      printReviewerTable(rev.reviewerStats, false)
    } else {
      printReviewerTable(rev.reviewerStats, true)
    }

    if (rev.recurringDismissed.length > 0) {
      console.log()
      console.log(`  ${chalk.dim("Recurring dismissed:")}`)
      for (const rd of rev.recurringDismissed.slice(0, 5)) {
        console.log(
          `    ${chalk.dim(`${rd.reviewer}:`)} "${rd.title}" — ${rd.occurrences}/${rd.totalRuns} runs`,
        )
      }
    }

    if (i > 0) {
      const prev = revisions[i - 1]
      if (prev.hasTriage && rev.hasTriage) {
        printDelta(prev, rev)
      }
    }

    console.log()
  }
}

function printRevision(schema: string, rev: RevisionGroup, isDefault: boolean): void {
  console.log()
  if (isDefault) {
    console.log(
      `  ${chalk.bold(`Schema: ${schema}`)} ${chalk.dim(`(${rev.schemaHash})`)} — ${rev.runs} run${rev.runs !== 1 ? "s" : ""}`,
    )
  } else {
    console.log(`  ${chalk.bold(`Schema: ${schema}`)} — ${rev.runs} run${rev.runs !== 1 ? "s" : ""}`)
  }
  console.log(`  ${chalk.dim("Period:")} ${formatDateRange(rev.firstDate, rev.lastDate)}`)
  console.log()

  if (!rev.hasTriage) {
    console.log(`  ${chalk.dim("Note: no triage configured — all issues shown as untriaged")}`)
    console.log()
  }

  printReviewerTable(rev.reviewerStats, rev.hasTriage)

  if (rev.recurringDismissed.length > 0) {
    console.log()
    console.log(`  ${chalk.bold("Recurring dismissed")} ${chalk.dim(`(same title in ≥2 runs):`)}`)
    for (const rd of rev.recurringDismissed.slice(0, 10)) {
      console.log(
        `    ${chalk.dim(`${rd.reviewer}:`)} "${rd.title}" — ${rd.occurrences}/${rd.totalRuns} runs, always dismissed`,
      )
    }
  }

  console.log()
}

function printReviewerTable(stats: ReviewerStats[], hasTriage: boolean): void {
  if (stats.length === 0) return

  const nameWidth = Math.max(10, ...stats.map((s) => s.reviewer.length)) + 2
  const rtWidth = Math.max(8, ...stats.map((s) => `${s.runtime}/${s.model}`.length)) + 2

  if (hasTriage) {
    console.log(
      `  ${chalk.dim("Reviewer".padEnd(nameWidth))}` +
        `${chalk.dim("Runtime".padEnd(rtWidth))}` +
        `${chalk.dim("Runs".padStart(6))}` +
        `${chalk.dim("Issues".padStart(8))}` +
        `${chalk.dim("Actioned".padStart(14))}` +
        `${chalk.dim("Dismissed".padStart(14))}` +
        `${chalk.dim("Avg time".padStart(10))}` +
        `${chalk.dim("Cost/act".padStart(10))}`,
    )

    for (const s of stats) {
      const triaged = s.actionable + s.deferred + s.dismissed
      const actionableRate = triaged > 0 ? `${s.actionable} (${pct(s.actionable, triaged)})` : "—"
      const dismissedRate = triaged > 0 ? `${s.dismissed} (${pct(s.dismissed, triaged)})` : "—"
      const avgTime = `${(s.avgDurationMs / 1000).toFixed(0)}s`
      const costPerActionable =
        s.actionable > 0 ? `${(s.avgDurationMs / 1000 / (s.actionable / s.runs)).toFixed(0)}s` : "—"

      console.log(
        `  ${s.reviewer.padEnd(nameWidth)}` +
          `${chalk.dim(`${s.runtime}/${s.model}`.padEnd(rtWidth))}` +
          `${String(s.runs).padStart(6)}` +
          `${String(s.totalIssues).padStart(8)}` +
          `${actionableRate.padStart(14)}` +
          `${dismissedRate.padStart(14)}` +
          `${avgTime.padStart(10)}` +
          `${costPerActionable.padStart(10)}`,
      )
    }
  } else {
    console.log(
      `  ${chalk.dim("Reviewer".padEnd(nameWidth))}` +
        `${chalk.dim("Runtime".padEnd(rtWidth))}` +
        `${chalk.dim("Runs".padStart(6))}` +
        `${chalk.dim("Issues".padStart(8))}` +
        `${chalk.dim("Avg/run".padStart(10))}` +
        `${chalk.dim("Avg time".padStart(10))}`,
    )

    for (const s of stats) {
      const avgIssues = (s.totalIssues / s.runs).toFixed(1)
      const avgTime = `${(s.avgDurationMs / 1000).toFixed(0)}s`

      console.log(
        `  ${s.reviewer.padEnd(nameWidth)}` +
          `${chalk.dim(`${s.runtime}/${s.model}`.padEnd(rtWidth))}` +
          `${String(s.runs).padStart(6)}` +
          `${String(s.totalIssues).padStart(8)}` +
          `${avgIssues.padStart(10)}` +
          `${avgTime.padStart(10)}`,
      )
    }
  }
}

function printDelta(prev: RevisionGroup, curr: RevisionGroup): void {
  const deltas: string[] = []

  for (const currStat of curr.reviewerStats) {
    const prevStat = prev.reviewerStats.find((s) => s.reviewer === currStat.reviewer)
    if (!prevStat) continue

    const prevTotal = prevStat.actionable + prevStat.deferred + prevStat.dismissed
    const currTotal = currStat.actionable + currStat.deferred + currStat.dismissed
    if (prevTotal === 0 || currTotal === 0) continue

    const prevActionableRate = prevStat.actionable / prevTotal
    const currActionableRate = currStat.actionable / currTotal
    const prevDismissedRate = prevStat.dismissed / prevTotal
    const currDismissedRate = currStat.dismissed / currTotal

    const actionableDelta = currActionableRate - prevActionableRate
    const dismissedDelta = currDismissedRate - prevDismissedRate

    if (Math.abs(actionableDelta) > 0.05 || Math.abs(dismissedDelta) > 0.05) {
      const aDir = actionableDelta > 0 ? chalk.green("↑") : actionableDelta < 0 ? chalk.red("↓") : "≈"
      const dDir = dismissedDelta > 0 ? chalk.red("↑") : dismissedDelta < 0 ? chalk.green("↓") : "≈"

      deltas.push(
        `    ${currStat.reviewer}: ` +
          `actionable ${pct(prevStat.actionable, prevTotal)} → ${pct(currStat.actionable, currTotal)} ${aDir}, ` +
          `dismissed ${pct(prevStat.dismissed, prevTotal)} → ${pct(currStat.dismissed, currTotal)} ${dDir}`,
      )
    }
  }

  if (deltas.length > 0) {
    console.log()
    console.log(`  ${chalk.dim("Delta from previous revision:")}`)
    for (const d of deltas) console.log(d)
  }
}

function pct(n: number, total: number): string {
  if (total === 0) return "0%"
  return `${Math.round((n / total) * 100)}%`
}

function formatDateRange(first: string, last: string): string {
  const f = formatShortDate(first)
  const l = formatShortDate(last)
  return f === l ? f : `${f} → ${l}`
}

function formatShortDate(iso: string): string {
  const d = new Date(iso)
  const months = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ]
  return `${months[d.getMonth()]} ${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`
}
