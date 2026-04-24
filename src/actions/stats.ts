import { Effect } from "effect"
import { CrevConfig } from "../services/CrevConfig.js"
import { ReviewStore } from "../services/ReviewStore.js"
import { getOutputDir } from "../core/config.js"
import type { ReviewResult } from "../core/types.js"
import type { ConfigParseError } from "../errors.js"

export type ReviewerStats = {
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

export type RecurringDismissed = {
  reviewer: string
  title: string
  occurrences: number
  totalRuns: number
}

export type RevisionGroup = {
  schemaHash: string
  runs: number
  firstDate: string
  lastDate: string
  reviewerStats: ReviewerStats[]
  recurringDismissed: RecurringDismissed[]
  hasTriage: boolean
}

export type StatsInput = {
  /** Optional schema name filter. */
  readonly schema?: string
}

export type StatsOutput = {
  /** Aggregated revisions per schema name. Empty when no reviews match. */
  readonly bySchema: Record<string, { revisions: RevisionGroup[] }>
  /** Review files that failed to parse and were skipped. */
  readonly skippedFiles: string[]
  /** All loaded reviews (unfiltered). Empty when the output dir is empty. */
  readonly totalLoaded: number
}

/**
 * Loads every review under the configured output directory, optionally
 * filters by schema name, and groups by schema + schemaHash into
 * `RevisionGroup`s suitable for both the CLI `stats` view and the TUI.
 *
 * Returns `totalLoaded` and `bySchema` separately so callers can
 * distinguish "no reviews at all" (exit with error) from "no reviews
 * matched the filter" (different, filter-specific error).
 */
export const statsAction = (
  input: StatsInput,
): Effect.Effect<StatsOutput, ConfigParseError, CrevConfig | ReviewStore> =>
  Effect.gen(function* () {
    const cfg = yield* CrevConfig
    const store = yield* ReviewStore
    const { crevDir, config } = yield* cfg.load()
    const outputDir = getOutputDir(config, crevDir)

    const { reviews: loaded, skipped } = yield* store.list(outputDir)
    const reviews = loaded.map((l) => l.result)

    const filtered = input.schema
      ? reviews.filter((r) => r.metadata.schema === input.schema)
      : reviews

    const bySchema: Record<string, { revisions: RevisionGroup[] }> = {}
    for (const [schema, runs] of Object.entries(groupBy(filtered, (r) => r.metadata.schema))) {
      bySchema[schema] = { revisions: buildRevisions(runs) }
    }

    return { bySchema, skippedFiles: skipped, totalLoaded: reviews.length }
  })

// ── aggregation helpers (exported for reuse by CLI rendering + tests) ──

export function buildRevisions(reviews: ReviewResult[]): RevisionGroup[] {
  const byHash = groupBy(reviews, (r) => r.metadata.schemaHash ?? "unknown")

  return Object.entries(byHash)
    .map(([hash, runs]) => {
      const sorted = runs
        .slice()
        .sort((a, b) => a.metadata.timestamp.localeCompare(b.metadata.timestamp))
      return buildRevisionGroup(hash, sorted)
    })
    .sort((a, b) => a.firstDate.localeCompare(b.firstDate))
}

function buildRevisionGroup(schemaHash: string, runs: ReviewResult[]): RevisionGroup {
  const firstDate = runs[0].metadata.timestamp
  const lastDate = runs[runs.length - 1].metadata.timestamp

  const reviewerMap = new Map<
    string,
    {
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
    }
  >()

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

  const recurringDismissed: RecurringDismissed[] = []
  for (const [reviewer, entry] of reviewerMap) {
    const clusters = clusterDismissedTitles(entry.dismissedTitles)
    for (const cluster of clusters) {
      if (cluster.count >= 2) {
        recurringDismissed.push({
          reviewer,
          title: cluster.representative,
          occurrences: cluster.count,
          totalRuns,
        })
      }
    }
  }
  recurringDismissed.sort((a, b) => b.occurrences - a.occurrences)

  return {
    schemaHash,
    runs: totalRuns,
    firstDate,
    lastDate,
    reviewerStats,
    recurringDismissed,
    hasTriage,
  }
}

// ── pure helpers (still exported so CLI rendering + tests can use them) ──

export function normalizeTitle(title: string): string {
  const noise = new Set([
    "a", "an", "the", "is", "are", "was", "were", "be", "been", "being",
    "in", "on", "at", "to", "for", "of", "with", "by", "from", "as",
    "and", "or", "but", "not", "no", "this", "that", "it", "its",
    "does", "do", "has", "have", "had", "will", "would", "could", "should",
    "may", "might", "can", "vs", "between", "across", "when", "while",
  ])

  return title
    .toLowerCase()
    .replace(/[`'"(){}\[\]]/g, "")
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/[\s-]+/)
    .filter((w) => w.length > 1 && !noise.has(w))
    .sort()
    .join(" ")
}

export function titlesAreSimilar(a: string, b: string): boolean {
  const wordsA = new Set(a.split(" "))
  const wordsB = new Set(b.split(" "))
  const intersection = [...wordsA].filter((w) => wordsB.has(w)).length
  const union = new Set([...wordsA, ...wordsB]).size
  return union > 0 && intersection / union > 0.5
}

export function clusterDismissedTitles(
  titles: string[],
): { representative: string; count: number }[] {
  const clusters: { normalized: string; representative: string; count: number }[] = []

  for (const title of titles) {
    const norm = normalizeTitle(title)
    const existing = clusters.find((c) => titlesAreSimilar(c.normalized, norm))
    if (existing) {
      existing.count++
      if (title.length < existing.representative.length) {
        existing.representative = title
      }
    } else {
      clusters.push({ normalized: norm, representative: title, count: 1 })
    }
  }

  return clusters.sort((a, b) => b.count - a.count)
}

function groupBy<T>(items: T[], key: (item: T) => string): Record<string, T[]> {
  const groups: Record<string, T[]> = {}
  for (const item of items) {
    const k = key(item)
    ;(groups[k] ??= []).push(item)
  }
  return groups
}
