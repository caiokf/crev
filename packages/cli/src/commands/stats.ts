import fs from "node:fs"
import path from "node:path"
import type { Command } from "commander"
import chalk from "chalk"
import { findCrevDir, loadConfig, getOutputDir } from "../core/config.js"
import type { ReviewResult, ReviewIssue } from "../core/types.js"

type ReviewerStats = {
  reviewer: string
  runtime: string
  model: string
  runs: number
  totalIssues: number
  avgDurationMs: number
  actionable: number
  deferred: number
  dismissed: number
  untriaged: number
  byCategory: Record<string, number>
  bySeverity: Record<string, number>
}

type RecurringDismissed = {
  reviewer: string
  title: string
  occurrences: number
  totalRuns: number
}

type RevisionGroup = {
  schemaHash: string
  runs: number
  firstDate: string
  lastDate: string
  reviewerStats: ReviewerStats[]
  recurringDismissed: RecurringDismissed[]
  hasTriage: boolean
}

export function registerStatsCommand(program: Command): void {
  program
    .command("stats")
    .description("Aggregate review statistics across runs")
    .option("--schema <name>", "Filter by schema name")
    .option("--history", "Show all schema revisions with comparison deltas")
    .option("--json", "Machine-readable JSON output")
    .action((opts) => {
      const crevDir = findCrevDir()
      const config = loadConfig(crevDir)
      const outputDir = getOutputDir(config, crevDir)

      if (!fs.existsSync(outputDir)) {
        console.error(chalk.red("No review files found. Run a review first with: crev run --schema <name>"))
        process.exit(1)
      }

      const reviews = loadAllReviews(outputDir)

      if (reviews.length === 0) {
        console.error(chalk.red("No review files found. Run a review first with: crev run --schema <name>"))
        process.exit(1)
      }

      // Filter by schema if requested
      const filtered = opts.schema
        ? reviews.filter((r) => r.metadata.schema === opts.schema)
        : reviews

      if (filtered.length === 0) {
        console.error(chalk.red(`No reviews found for schema "${opts.schema}"`))
        process.exit(1)
      }

      // Group by schema name
      const bySchema = groupBy(filtered, (r) => r.metadata.schema)

      if (opts.json) {
        const data = Object.fromEntries(
          Object.entries(bySchema).map(([schema, runs]) => {
            const revisions = buildRevisions(runs)
            return [schema, { revisions }]
          }),
        )
        console.log(JSON.stringify(data, null, 2))
        return
      }

      for (const [schema, runs] of Object.entries(bySchema)) {
        const revisions = buildRevisions(runs)

        if (opts.history) {
          printHistory(schema, revisions)
        } else {
          // Default: show only the latest revision
          const latest = revisions[revisions.length - 1]
          printRevision(schema, latest, runs.length, true)
        }
      }
    })
}

function loadAllReviews(outputDir: string): ReviewResult[] {
  return fs
    .readdirSync(outputDir)
    .filter((f) => f.endsWith(".json") && f !== ".gitkeep")
    .sort()
    .flatMap((f) => {
      try {
        const content = fs.readFileSync(path.join(outputDir, f), "utf-8")
        return [JSON.parse(content) as ReviewResult]
      } catch {
        return []
      }
    })
}

function buildRevisions(reviews: ReviewResult[]): RevisionGroup[] {
  // Group by schemaHash. Reviews without a hash get "unknown"
  const byHash = groupBy(reviews, (r) => r.metadata.schemaHash ?? "unknown")

  // Sort groups by earliest timestamp
  const groups = Object.entries(byHash)
    .map(([hash, runs]) => {
      const sorted = runs.sort((a, b) => a.metadata.timestamp.localeCompare(b.metadata.timestamp))
      return buildRevisionGroup(hash, sorted)
    })
    .sort((a, b) => a.firstDate.localeCompare(b.firstDate))

  return groups
}

function buildRevisionGroup(schemaHash: string, runs: ReviewResult[]): RevisionGroup {
  const firstDate = runs[0].metadata.timestamp
  const lastDate = runs[runs.length - 1].metadata.timestamp

  // Aggregate per-reviewer stats
  const reviewerMap = new Map<string, {
    runtime: string
    model: string
    runs: number
    totalIssues: number
    totalDurationMs: number
    actionable: number
    deferred: number
    dismissed: number
    untriaged: number
    byCategory: Record<string, number>
    bySeverity: Record<string, number>
    dismissedTitles: string[]
  }>()

  const hasTriage = runs.some((r) => r.summary.triage !== undefined)

  for (const run of runs) {
    for (const review of run.reviews) {
      let entry = reviewerMap.get(review.reviewer)
      if (!entry) {
        entry = {
          runtime: review.runtime,
          model: review.model,
          runs: 0,
          totalIssues: 0,
          totalDurationMs: 0,
          actionable: 0,
          deferred: 0,
          dismissed: 0,
          untriaged: 0,
          byCategory: {},
          bySeverity: {},
          dismissedTitles: [],
        }
        reviewerMap.set(review.reviewer, entry)
      }

      entry.runs++
      entry.totalIssues += review.issues.length
      entry.totalDurationMs += review.durationMs

      for (const issue of review.issues) {
        entry.byCategory[issue.category] = (entry.byCategory[issue.category] ?? 0) + 1
        entry.bySeverity[issue.severity] = (entry.bySeverity[issue.severity] ?? 0) + 1

        if (issue.triage) {
          if (issue.triage.verdict === "actionable") entry.actionable++
          else if (issue.triage.verdict === "deferred") entry.deferred++
          else if (issue.triage.verdict === "dismissed") {
            entry.dismissed++
            entry.dismissedTitles.push(issue.title)
          }
        } else {
          entry.untriaged++
        }
      }
    }
  }

  const totalRuns = runs.length

  // Build reviewer stats
  const reviewerStats: ReviewerStats[] = [...reviewerMap.entries()]
    .map(([reviewer, entry]) => ({
      reviewer,
      runtime: entry.runtime,
      model: entry.model,
      runs: entry.runs,
      totalIssues: entry.totalIssues,
      avgDurationMs: entry.totalDurationMs / entry.runs,
      actionable: entry.actionable,
      deferred: entry.deferred,
      dismissed: entry.dismissed,
      untriaged: entry.untriaged,
      byCategory: entry.byCategory,
      bySeverity: entry.bySeverity,
    }))
    .sort((a, b) => {
      const aRate = a.totalIssues > 0 ? a.actionable / a.totalIssues : 0
      const bRate = b.totalIssues > 0 ? b.actionable / b.totalIssues : 0
      return bRate - aRate
    })

  // Detect recurring dismissed patterns by clustering similar titles
  const recurringDismissed: RecurringDismissed[] = []
  for (const [reviewer, entry] of reviewerMap) {
    const clusters = clusterDismissedTitles(entry.dismissedTitles)
    for (const cluster of clusters) {
      if (cluster.count >= 2) {
        recurringDismissed.push({ reviewer, title: cluster.representative, occurrences: cluster.count, totalRuns })
      }
    }
  }
  recurringDismissed.sort((a, b) => b.occurrences - a.occurrences)

  return { schemaHash, runs: totalRuns, firstDate, lastDate, reviewerStats, recurringDismissed, hasTriage }
}

function printHistory(schema: string, revisions: RevisionGroup[]): void {
  console.log()
  console.log(`  ${chalk.bold(`Schema: ${schema}`)} — ${revisions.length} revision${revisions.length !== 1 ? "s" : ""}, ${revisions.reduce((s, r) => s + r.runs, 0)} runs total`)
  console.log()

  for (let i = 0; i < revisions.length; i++) {
    const rev = revisions[i]
    const isCurrent = i === revisions.length - 1
    const label = isCurrent ? ` ${chalk.green("← current")}` : ""

    console.log(`  ${chalk.bold(`Revision ${i + 1}`)}  ${chalk.dim(`(${rev.schemaHash})`)}  ${rev.runs} run${rev.runs !== 1 ? "s" : ""}   ${formatDateRange(rev.firstDate, rev.lastDate)}${label}`)

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
        console.log(`    ${chalk.dim(`${rd.reviewer}:`)} "${rd.title}" — ${rd.occurrences}/${rd.totalRuns} runs`)
      }
    }

    // Print delta from previous revision
    if (i > 0) {
      const prev = revisions[i - 1]
      if (prev.hasTriage && rev.hasTriage) {
        printDelta(prev, rev)
      }
    }

    console.log()
  }
}

function printRevision(schema: string, rev: RevisionGroup, totalRunsAllRevisions: number, isDefault: boolean): void {
  console.log()
  if (isDefault) {
    console.log(`  ${chalk.bold(`Schema: ${schema}`)} ${chalk.dim(`(${rev.schemaHash})`)} — ${rev.runs} run${rev.runs !== 1 ? "s" : ""}`)
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
      console.log(`    ${chalk.dim(`${rd.reviewer}:`)} "${rd.title}" — ${rd.occurrences}/${rd.totalRuns} runs, always dismissed`)
    }
  }

  console.log()
}

function printReviewerTable(stats: ReviewerStats[], hasTriage: boolean): void {
  if (stats.length === 0) return

  const runtimeLabel = (s: ReviewerStats) => chalk.dim(`${s.runtime}/${s.model}`)
  const nameWidth = Math.max(10, ...stats.map((s) => s.reviewer.length)) + 2
  const rtWidth = Math.max(8, ...stats.map((s) => `${s.runtime}/${s.model}`.length)) + 2

  if (hasTriage) {
    // Header
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
      const costPerActionable = s.actionable > 0
        ? `${(s.avgDurationMs / 1000 / (s.actionable / s.runs)).toFixed(0)}s`
        : "—"

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
    // No triage — simpler table
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

// ── Helpers ──

function normalizeTitle(title: string): string {
  // Extract significant keywords, stripping noise words and punctuation.
  // Goal: "Command name `update` is misleading" and "`update` verb is ambiguous"
  // should map to a similar fingerprint.
  const noise = new Set([
    "a", "an", "the", "is", "are", "was", "were", "be", "been", "being",
    "in", "on", "at", "to", "for", "of", "with", "by", "from", "as",
    "and", "or", "but", "not", "no", "this", "that", "it", "its",
    "does", "do", "has", "have", "had", "will", "would", "could", "should",
    "may", "might", "can", "vs", "between", "across", "when", "while",
  ])

  const words = title
    .toLowerCase()
    .replace(/[`'"(){}\[\]]/g, "")
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/[\s-]+/)
    .filter((w) => w.length > 1 && !noise.has(w))
    .sort()

  return words.join(" ")
}

function titlesAreSimilar(a: string, b: string): boolean {
  const wordsA = new Set(a.split(" "))
  const wordsB = new Set(b.split(" "))
  const intersection = [...wordsA].filter((w) => wordsB.has(w)).length
  const union = new Set([...wordsA, ...wordsB]).size
  // Jaccard similarity > 0.5 means more than half the keywords overlap
  return union > 0 && intersection / union > 0.5
}

function clusterDismissedTitles(titles: string[]): { representative: string; count: number }[] {
  const clusters: { normalized: string; representative: string; count: number }[] = []

  for (const title of titles) {
    const norm = normalizeTitle(title)
    const existing = clusters.find((c) => titlesAreSimilar(c.normalized, norm))
    if (existing) {
      existing.count++
      // Keep the shortest title as representative (usually the clearest)
      if (title.length < existing.representative.length) {
        existing.representative = title
      }
    } else {
      clusters.push({ normalized: norm, representative: title, count: 1 })
    }
  }

  return clusters.sort((a, b) => b.count - a.count)
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
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
  return `${months[d.getMonth()]} ${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`
}

function groupBy<T>(items: T[], key: (item: T) => string): Record<string, T[]> {
  const groups: Record<string, T[]> = {}
  for (const item of items) {
    const k = key(item)
    ;(groups[k] ??= []).push(item)
  }
  return groups
}
