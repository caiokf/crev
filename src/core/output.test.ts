import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { validateReviewFilePath, recomputeSummary, renderMarkdown, mergeAndWriteOutput } from "./output.js"
import type { NormalizedReview, ReviewIssue, ReviewResult } from "./types.js"

const makeIssue = (overrides: Partial<ReviewIssue> = {}): ReviewIssue => ({
  id: "test--1",
  reviewer: "Test",
  runtime: "claude",
  model: "opus",
  severity: "medium",
  category: "bug",
  title: "Test issue",
  description: "desc",
  ...overrides,
})

const makeReview = (overrides: Partial<NormalizedReview> = {}): NormalizedReview => ({
  reviewer: "Test",
  runtime: "claude",
  model: "opus",
  durationMs: 1000,
  exitCode: 0,
  rawLength: 100,
  issues: [],
  ...overrides,
})

describe("validateReviewFilePath", () => {
  it("accepts paths within the project root", () => {
    const result = validateReviewFilePath(".crev/reviews/test.json", "/project")
    expect(result).toBe(path.resolve("/project", ".crev/reviews/test.json"))
  })

  it("rejects paths that escape the project root", () => {
    expect(() => {
      validateReviewFilePath("../../etc/passwd", "/project/sub")
    }).toThrow("resolves outside the project root")
  })

  it("rejects absolute paths outside the project", () => {
    expect(() => {
      validateReviewFilePath("/tmp/evil.json", "/project")
    }).toThrow("resolves outside the project root")
  })
})

describe("recomputeSummary", () => {
  it("returns empty summary for no reviews", () => {
    const s = recomputeSummary([])
    expect(s.totalIssues).toBe(0)
    expect(s.triage).toBeUndefined()
  })

  it("counts by severity, category, and reviewer", () => {
    const reviews = [makeReview({
      issues: [
        makeIssue({ severity: "high", category: "security" }),
        makeIssue({ id: "2", severity: "low", category: "style" }),
      ],
    })]
    const s = recomputeSummary(reviews)
    expect(s.totalIssues).toBe(2)
    expect(s.bySeverity).toEqual({ high: 1, low: 1 })
    expect(s.byCategory).toEqual({ security: 1, style: 1 })
  })

  it("computes triage summary when issues have triage", () => {
    const reviews = [makeReview({
      issues: [
        makeIssue({ triage: { verdict: "actionable", reasoning: "yes" } }),
        makeIssue({ id: "2", triage: { verdict: "dismissed", reasoning: "no" } }),
      ],
    })]
    const s = recomputeSummary(reviews)
    expect(s.triage).toEqual({ actionable: 1, deferred: 0, dismissed: 1 })
  })
})

describe("renderMarkdown", () => {
  it("renders a complete markdown report", () => {
    const result: ReviewResult = {
      metadata: {
        slug: "test",
        timestamp: "2026-04-22T00:00:00Z",
        schema: "quick",
        diffType: "all",
      },
      reviews: [makeReview({
        reviewer: "Engineer",
        issues: [makeIssue({ title: "Bug found", file: "src/app.ts", line: 42 })],
      })],
      summary: recomputeSummary([makeReview({
        issues: [makeIssue()],
      })]),
    }

    const md = renderMarkdown(result)
    expect(md).toContain("# Review: test")
    expect(md).toContain("Schema: quick")
    expect(md).toContain("## Engineer")
    expect(md).toContain("Bug found")
    expect(md).toContain("src/app.ts:42")
  })

  it("handles reviews with no issues", () => {
    const result: ReviewResult = {
      metadata: { slug: "test", timestamp: "2026-04-22T00:00:00Z", schema: "quick", diffType: "all" },
      reviews: [makeReview()],
      summary: recomputeSummary([makeReview()]),
    }
    const md = renderMarkdown(result)
    expect(md).toContain("No issues found")
  })
})

describe("mergeAndWriteOutput", () => {
  let tmpDir: string
  let origCwd: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "crev-output-"))
    origCwd = process.cwd()
    process.chdir(tmpDir)
  })

  afterEach(() => {
    process.chdir(origCwd)
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  const makeResult = (reviewer: string, issues: ReviewIssue[]): ReviewResult => ({
    metadata: { slug: "test", timestamp: "2026-04-22T00:00:00Z", schema: "quick", diffType: "all" },
    reviews: [makeReview({ reviewer, issues })],
    summary: recomputeSummary([makeReview({ reviewer, issues })]),
  })

  it("creates new file if it does not exist", () => {
    const result = makeResult("Eng", [makeIssue()])
    const filePath = mergeAndWriteOutput(result, "review.json")
    expect(fs.existsSync(filePath)).toBe(true)
    const written = JSON.parse(fs.readFileSync(filePath, "utf-8"))
    expect(written.reviews).toHaveLength(1)
  })

  it("merges new reviewer into existing file", () => {
    const first = makeResult("Eng", [makeIssue({ id: "eng-1" })])
    const filePath = mergeAndWriteOutput(first, "review.json")

    const second = makeResult("Security", [makeIssue({ id: "sec-1", reviewer: "Security" })])
    mergeAndWriteOutput(second, "review.json")

    const merged = JSON.parse(fs.readFileSync(filePath, "utf-8"))
    expect(merged.reviews).toHaveLength(2)
  })

  it("preserves existing triage when new run lacks it", () => {
    const first = makeResult("Eng", [
      makeIssue({ id: "eng-1", triage: { verdict: "dismissed", reasoning: "noise" } }),
    ])
    mergeAndWriteOutput(first, "review.json")

    const second = makeResult("Eng", [makeIssue({ id: "eng-1" })])
    const filePath = mergeAndWriteOutput(second, "review.json")

    const merged = JSON.parse(fs.readFileSync(filePath, "utf-8"))
    expect(merged.reviews[0].issues[0].triage.verdict).toBe("dismissed")
  })
})
