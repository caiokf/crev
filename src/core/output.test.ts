import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { buildResult, validateReviewFilePath, recomputeSummary, renderMarkdown, formatOutputPath, printSummary, mergeAndWriteOutput } from "./output.js"
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

describe("buildResult", () => {
  it("constructs metadata from opts and computes summary", () => {
    const reviews = [makeReview({
      issues: [makeIssue({ severity: "high", category: "security" })],
    })]
    const result = buildResult(reviews, {
      slug: "my-feature",
      schemaName: "quick",
      schemaHash: "abc123",
      diff: { base: "main", type: "all" },
      target: { kind: "fresh", description: "testing" },
    }, "2026-04-25T00:00:00Z")

    expect(result.metadata.slug).toBe("my-feature")
    expect(result.metadata.schema).toBe("quick")
    expect(result.metadata.schemaHash).toBe("abc123")
    expect(result.metadata.diffBase).toBe("main")
    expect(result.metadata.diffType).toBe("all")
    expect(result.metadata.timestamp).toBe("2026-04-25T00:00:00Z")
    expect(result.metadata.description).toBe("testing")
    expect(result.summary.totalIssues).toBe(1)
    expect(result.summary.bySeverity).toEqual({ high: 1 })
  })

  it("sets diffType to analyze when analyze is true", () => {
    const result = buildResult([], {
      slug: "s",
      schemaName: "q",
      diff: { type: "all" },
      analyze: true,
      target: { kind: "fresh" },
    }, "t")

    expect(result.metadata.diffType).toBe("analyze")
  })

  it("omits description for merge targets", () => {
    const result = buildResult([], {
      slug: "s",
      schemaName: "q",
      diff: { type: "all" },
      target: { kind: "merge", reviewFile: "x.json" },
    }, "t")

    expect(result.metadata.description).toBeUndefined()
  })
})

describe("formatOutputPath", () => {
  it("returns relative json path for json format", () => {
    const cwd = process.cwd()
    const paths = { jsonPath: `${cwd}/reviews/test.json` }
    const result = formatOutputPath(paths, "json")
    expect(result).toBe("reviews/test.json")
  })

  it("returns relative markdown path for markdown format", () => {
    const cwd = process.cwd()
    const paths = {
      jsonPath: `${cwd}/reviews/test.json`,
      markdownPath: `${cwd}/reviews/test.md`,
    }
    const result = formatOutputPath(paths, "markdown")
    expect(result).toBe("reviews/test.md")
  })

  it("returns both paths for both format", () => {
    const cwd = process.cwd()
    const paths = {
      jsonPath: `${cwd}/reviews/test.json`,
      markdownPath: `${cwd}/reviews/test.md`,
    }
    const result = formatOutputPath(paths, "both")
    expect(result).toContain("test.json")
    expect(result).toContain("test.md")
  })

  it("falls back to json path when markdown path is missing", () => {
    const cwd = process.cwd()
    const paths = { jsonPath: `${cwd}/reviews/test.json` }
    const result = formatOutputPath(paths, "markdown")
    expect(result).toBe("reviews/test.json")
  })
})

describe("renderMarkdown edge cases", () => {
  it("includes diffBase and description when present", () => {
    const result: ReviewResult = {
      metadata: {
        slug: "feat",
        timestamp: "2026-04-25T00:00:00Z",
        schema: "quick",
        diffType: "branch",
        diffBase: "main",
        description: "Adding new feature",
      },
      reviews: [makeReview()],
      summary: recomputeSummary([makeReview()]),
    }
    const md = renderMarkdown(result)
    expect(md).toContain("Diff base: main")
    expect(md).toContain("Description: Adding new feature")
  })

  it("renders triage summary instead of severity breakdown when triage is present", () => {
    const reviews = [makeReview({
      issues: [
        makeIssue({ triage: { verdict: "actionable", reasoning: "yes" } }),
        makeIssue({ id: "2", triage: { verdict: "dismissed", reasoning: "no" } }),
      ],
    })]
    const result: ReviewResult = {
      metadata: { slug: "t", timestamp: "t", schema: "q", diffType: "all" },
      reviews,
      summary: recomputeSummary(reviews),
    }
    const md = renderMarkdown(result)
    expect(md).toContain("Actionable: 1")
    expect(md).toContain("Dismissed: 1")
  })

  it("includes triage verdict in issue line", () => {
    const reviews = [makeReview({
      reviewer: "Eng",
      issues: [makeIssue({ title: "Bug", triage: { verdict: "deferred", reasoning: "later" } })],
    })]
    const result: ReviewResult = {
      metadata: { slug: "t", timestamp: "t", schema: "q", diffType: "all" },
      reviews,
      summary: recomputeSummary(reviews),
    }
    const md = renderMarkdown(result)
    expect(md).toContain("[deferred]")
  })

  it("omits file location when issue has no file", () => {
    const reviews = [makeReview({
      issues: [makeIssue({ file: undefined, line: undefined })],
    })]
    const result: ReviewResult = {
      metadata: { slug: "t", timestamp: "t", schema: "q", diffType: "all" },
      reviews,
      summary: recomputeSummary(reviews),
    }
    const md = renderMarkdown(result)
    expect(md).not.toContain("(undefined")
    expect(md).toContain("Test issue")
  })
})

describe("printSummary", () => {
  it("prints plain summary without chalk formatting", () => {
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {})
    const result: ReviewResult = {
      metadata: { slug: "t", timestamp: "t", schema: "q", diffType: "all" },
      reviews: [makeReview({
        issues: [makeIssue({ severity: "high" }), makeIssue({ id: "2", severity: "low" })],
      })],
      summary: recomputeSummary([makeReview({
        issues: [makeIssue({ severity: "high" }), makeIssue({ id: "2", severity: "low" })],
      })]),
    }
    printSummary(result, "output.json", true)
    const output = consoleSpy.mock.calls.map(([arg]) => String(arg)).join("\n")
    expect(output).toContain("Review Summary")
    expect(output).toContain("high: 1")
    expect(output).toContain("low: 1")
    expect(output).toContain("output.json")
    consoleSpy.mockRestore()
  })

  it("prints triage summary when triage is present", () => {
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {})
    const reviews = [makeReview({
      issues: [
        makeIssue({ triage: { verdict: "actionable", reasoning: "y" } }),
        makeIssue({ id: "2", triage: { verdict: "dismissed", reasoning: "n" } }),
      ],
    })]
    const result: ReviewResult = {
      metadata: { slug: "t", timestamp: "t", schema: "q", diffType: "all" },
      reviews,
      summary: recomputeSummary(reviews),
    }
    printSummary(result, "out.json", true)
    const output = consoleSpy.mock.calls.map(([arg]) => String(arg)).join("\n")
    expect(output).toContain("Triaged")
    expect(output).toContain("actionable: 1")
    expect(output).toContain("dismissed: 1")
    consoleSpy.mockRestore()
  })

  it("prints styled output to stdout in non-plain mode", () => {
    const stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true)
    const result: ReviewResult = {
      metadata: { slug: "t", timestamp: "t", schema: "q", diffType: "all" },
      reviews: [makeReview()],
      summary: recomputeSummary([makeReview()]),
    }
    printSummary(result, "out.json")
    const output = stdoutSpy.mock.calls.map(([arg]) => String(arg)).join("")
    expect(output).toContain("Review Summary")
    expect(output).toContain("No issues found")
    stdoutSpy.mockRestore()
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
