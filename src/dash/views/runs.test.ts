import { describe, expect, it } from "vitest"
import { formatRow as formatRunRow } from "./runs-list.js"
import { flattenIssues, formatIssueRow, renderMeta } from "./run-detail.js"
import { findIssue, renderIssue } from "./issue-detail.js"
import type { ReviewIssue, ReviewResult } from "../../core/types.js"

const issue: ReviewIssue = {
  id: "i-1",
  reviewer: "Engineer",
  runtime: "claude",
  model: "sonnet",
  file: "src/foo.ts",
  line: 42,
  severity: "high",
  category: "bug",
  title: "Null deref",
  description: "calling .trim() on possibly undefined value",
}

const review: ReviewResult = {
  metadata: {
    slug: "add-feature",
    timestamp: "2026-04-23T12:34:56Z",
    schema: "quick",
    diffType: "all",
    diffBase: "main",
  },
  reviews: [
    {
      reviewer: "Engineer",
      runtime: "claude",
      model: "sonnet",
      durationMs: 1200,
      exitCode: 0,
      rawLength: 100,
      issues: [issue],
    },
  ],
  summary: {
    totalIssues: 1,
    bySeverity: { high: 1 },
    byCategory: { bug: 1 },
    byReviewer: { Engineer: 1 },
    triage: { actionable: 1, deferred: 0, dismissed: 0 },
  },
}

describe("runs list · formatRow", () => {
  it("includes timestamp, slug, schema and issue count", () => {
    const row = formatRunRow({
      filePath: "/repo/.crev/reviews/x.json",
      slug: "add-feature",
      schema: "quick",
      timestamp: "2026-04-23T12:34:56Z",
      totalIssues: 2,
      reviewers: 1,
    })
    expect(row).toContain("2026-04-23 12:34")
    expect(row).toContain("add-feature")
    expect(row).toContain("quick")
    expect(row).toContain("2 issues")
    expect(row).toContain("x.json")
  })

  it("singularises a single issue", () => {
    const row = formatRunRow({
      filePath: "x.json",
      slug: "s",
      schema: "q",
      timestamp: "2026-04-23T12:34:56Z",
      totalIssues: 1,
      reviewers: 1,
    })
    expect(row).toContain("1 issue ")
  })
})

describe("run detail · renderMeta", () => {
  it("shows metadata, summary, and reviewer list", () => {
    const out = renderMeta(review)
    expect(out).toContain("add-feature")
    expect(out).toContain("schema: quick")
    expect(out).toContain("diff: all vs main")
    expect(out).toContain("total issues: 1")
    expect(out).toContain("1 actionable")
    expect(out).toContain("Engineer")
  })
})

describe("run detail · flattenIssues / formatIssueRow", () => {
  it("flattens issues across reviewers", () => {
    expect(flattenIssues(review)).toEqual([issue])
  })

  it("includes severity tag and file:line", () => {
    const row = formatIssueRow(issue)
    expect(row).toContain("HIGH")
    expect(row).toContain("Engineer")
    expect(row).toContain("Null deref")
    expect(row).toContain("src/foo.ts:42")
  })
})

describe("issue detail · findIssue / renderIssue", () => {
  it("finds an issue by id", () => {
    expect(findIssue([issue], "i-1")).toBe(issue)
    expect(findIssue([issue], "nope")).toBeUndefined()
  })

  it("renders title, metadata, file and description", () => {
    const out = renderIssue(issue)
    expect(out).toContain("Null deref")
    expect(out).toContain("high")
    expect(out).toContain("bug")
    expect(out).toContain("src/foo.ts:42")
    expect(out).toContain("calling .trim()")
  })

  it("renders triage verdict + enrichment when present", () => {
    const triaged: ReviewIssue = {
      ...issue,
      triage: {
        verdict: "actionable",
        reasoning: "real bug",
        enrichment: {
          title: "Null deref",
          context: "...",
          minimalFix: { summary: "guard the call", patch: "if (x) x.trim()" },
          promptForAgents: "fix it",
        },
      },
    }
    const out = renderIssue(triaged)
    expect(out).toContain("Triage")
    expect(out).toContain("verdict: actionable")
    expect(out).toContain("guard the call")
    expect(out).toContain("if (x) x.trim()")
  })
})
