import { describe, expect, it } from "vitest"
import { ENTRIES, renderStats } from "./home.js"
import type { StatsOutput, RevisionGroup, ReviewerStats } from "../../actions/stats.js"

describe("home · ENTRIES", () => {
  it("assigns a unique single-letter shortcut to every entry", () => {
    const keys = ENTRIES.map((e) => e.key)
    expect(new Set(keys).size).toBe(keys.length)
    for (const k of keys) expect(k).toMatch(/^[a-z]$/)
  })

  it("avoids colliding with globally-reserved keys (q/escape/backspace)", () => {
    // `q` is the global quit key — binding it on the home list would
    // hijack quit and leave the user stranded.
    const keys = ENTRIES.map((e) => e.key)
    expect(keys).not.toContain("q")
  })
})

const makeReviewerStat = (overrides: Partial<ReviewerStats> = {}): ReviewerStats => ({
  reviewer: "Engineer",
  runtime: "claude",
  model: "sonnet",
  runs: 1,
  totalIssues: 5,
  avgDurationMs: 3000,
  actionable: 2,
  deferred: 1,
  dismissed: 1,
  untriaged: 1,
  byCategory: { bug: 3, style: 2 },
  bySeverity: { high: 2, medium: 2, low: 1 },
  ...overrides,
})

const makeRevision = (overrides: Partial<RevisionGroup> = {}): RevisionGroup => ({
  schemaHash: "abc123",
  runs: 3,
  firstDate: "2026-04-10T10:00:00Z",
  lastDate: "2026-04-20T10:00:00Z",
  reviewerStats: [makeReviewerStat()],
  recurringDismissed: [],
  hasTriage: true,
  ...overrides,
})

const makeStats = (overrides: Partial<StatsOutput> = {}): StatsOutput => ({
  bySchema: {
    quick: { revisions: [makeRevision()] },
  },
  skippedFiles: [],
  totalLoaded: 3,
  ...overrides,
})

describe("home · renderStats", () => {
  it("shows run count, issue count, and schema count", () => {
    const out = renderStats(makeStats())
    const strip = out.replace(/\{[^}]+\}/g, "")
    expect(strip).toContain("3 runs")
    expect(strip).toContain("5 issues")
    expect(strip).toContain("1 schema")
  })

  it("pluralises schema count correctly", () => {
    const stats = makeStats({
      bySchema: {
        quick: { revisions: [makeRevision()] },
        thorough: { revisions: [makeRevision()] },
      },
    })
    const out = renderStats(stats).replace(/\{[^}]+\}/g, "")
    expect(out).toContain("2 schemas")
  })

  it("shows severity bars for non-zero severities", () => {
    const out = renderStats(makeStats())
    expect(out).toContain("by severity")
    expect(out).toContain("high")
    expect(out).toContain("medium")
    expect(out).toContain("low")
  })

  it("shows triage breakdown when hasTriage is true", () => {
    const out = renderStats(makeStats())
    expect(out).toContain("triage")
    expect(out).toContain("actionable")
    expect(out).toContain("deferred")
    expect(out).toContain("dismissed")
    expect(out).toContain("untriaged")
  })

  it("omits triage section when hasTriage is false", () => {
    const stats = makeStats({
      bySchema: {
        quick: {
          revisions: [makeRevision({
            hasTriage: false,
            reviewerStats: [makeReviewerStat({ actionable: 0, deferred: 0, dismissed: 0, untriaged: 5 })],
          })],
        },
      },
    })
    const out = renderStats(stats)
    expect(out).not.toContain("triage")
  })

  it("shows category breakdown", () => {
    const out = renderStats(makeStats())
    const strip = out.replace(/\{[^}]+\}/g, "")
    expect(strip).toContain("by category")
    expect(strip).toContain("bug")
    expect(strip).toContain("style")
  })

  it("returns a helpful message when no reviews exist", () => {
    const stats = makeStats({ totalLoaded: 0, bySchema: {} })
    const out = renderStats(stats)
    expect(out).toContain("no reviews yet")
    expect(out).toContain("crev run")
  })

  it("aggregates across multiple schemas and revisions", () => {
    const stats = makeStats({
      totalLoaded: 6,
      bySchema: {
        quick: { revisions: [makeRevision({ reviewerStats: [makeReviewerStat({ totalIssues: 3 })] })] },
        thorough: { revisions: [makeRevision({ reviewerStats: [makeReviewerStat({ totalIssues: 7 })] })] },
      },
    })
    const out = renderStats(stats).replace(/\{[^}]+\}/g, "")
    expect(out).toContain("10 issues")
    expect(out).toContain("6 runs")
  })
})
