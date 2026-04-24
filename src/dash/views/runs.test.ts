import { describe, expect, it } from "vitest"
import { computeColumnWidths, formatRow as formatRunRow } from "./runs-list.js"
import { computeIssueWidths, flattenIssues, formatIssueRow, renderMeta } from "./run-detail.js"
import { buildCopyPrompt, findIssue, renderIssue } from "./issue-detail.js"
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
  const widths = { slug: 30, schema: 12, issues: 10 }

  it("includes timestamp, slug, schema and issue count", () => {
    const row = formatRunRow(
      {
        filePath: "/repo/.crev/reviews/x.json",
        slug: "add-feature",
        schema: "quick",
        timestamp: "2026-04-23T12:34:56Z",
        totalIssues: 2,
        reviewers: 1,
      },
      widths,
    )
    expect(row).toContain("2026-04-23 12:34")
    expect(row).toContain("add-feature")
    expect(row).toContain("quick")
    expect(row).toContain("2 issues")
    expect(row).toContain("x.json")
  })

  it("singularises a single issue", () => {
    const row = formatRunRow(
      {
        filePath: "x.json",
        slug: "s",
        schema: "q",
        timestamp: "2026-04-23T12:34:56Z",
        totalIssues: 1,
        reviewers: 1,
      },
      widths,
    )
    expect(row).toContain("1 issue ")
  })

  it("truncates overly long schema names with an ellipsis", () => {
    const row = formatRunRow(
      {
        filePath: "x.json",
        slug: "s",
        schema: "bugs-and-security",
        timestamp: "2026-04-23T12:34:56Z",
        totalIssues: 1,
        reviewers: 1,
      },
      { slug: 4, schema: 10, issues: 10 },
    )
    expect(row).toContain("bugs-and-…")
  })
})

describe("runs list · computeColumnWidths", () => {
  it("clamps slug + schema widths to the widest row with a max ceiling", () => {
    const widths = computeColumnWidths([
      {
        filePath: "a.json",
        slug: "short",
        schema: "cli",
        timestamp: "t",
        totalIssues: 0,
        reviewers: 1,
      },
      {
        filePath: "b.json",
        slug: "a-very-long-slug-name-here",
        schema: "product-readiness",
        timestamp: "t",
        totalIssues: 0,
        reviewers: 1,
      },
    ])
    expect(widths.slug).toBe(26)
    expect(widths.schema).toBe(17)
  })
})

describe("run detail · renderMeta", () => {
  it("shows metadata, summary, and reviewer list", () => {
    const out = renderMeta(review)
    expect(out).toContain("add-feature")
    expect(out).toContain("quick")
    expect(out).toContain("diff: all vs main")
    expect(out).toContain("total issues: ")
    expect(out).toContain("1 actionable")
    expect(out).toContain("Engineer")
  })
})

describe("run detail · flattenIssues / formatIssueRow", () => {
  it("flattens issues across reviewers", () => {
    expect(flattenIssues(review)).toEqual([issue])
  })

  it("includes severity tag and file:line", () => {
    const row = formatIssueRow(issue, computeIssueWidths([issue]))
    expect(row).toContain("HIGH")
    expect(row).toContain("Engineer")
    expect(row).toContain("Null deref")
    expect(row).toContain("src/foo.ts:42")
  })

  it("pads title + reviewer so file column aligns across rows", () => {
    const a: ReviewIssue = { ...issue, reviewer: "CLI Conventions", title: "short" }
    const b: ReviewIssue = {
      ...issue,
      id: "i-2",
      reviewer: "Bug Hunter",
      title: "a much longer issue title that explains the problem in detail",
    }
    const widths = computeIssueWidths([a, b])
    const rowA = formatIssueRow(a, widths)
    const rowB = formatIssueRow(b, widths)
    // strip blessed tags to compare visible positions
    const stripTags = (s: string) => s.replace(/\{[^}]+\}/g, "")
    const fileAt = (s: string) => stripTags(s).indexOf("src/foo.ts")
    expect(fileAt(rowA)).toBe(fileAt(rowB))
    expect(fileAt(rowA)).toBeGreaterThan(0)
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
    expect(out).toContain("HIGH")
    expect(out).toContain("bug")
    expect(out).toContain("src/foo.ts:42")
    expect(out).toContain("calling .trim()")
    expect(out).toContain("description")
  })

  it("omits the prompt section for issues without enrichment", () => {
    const out = renderIssue(issue)
    expect(out).not.toContain("prompt for ai agents")
  })

  it("renders triage verdict + enrichment when present", () => {
    const triaged: ReviewIssue = {
      ...issue,
      triage: {
        verdict: "actionable",
        reasoning: "real bug",
        enrichment: {
          title: "Null deref",
          context: "surrounding context here",
          minimalFix: { summary: "guard the call", patch: "if (x) x.trim()", language: "ts" },
          promptForAgents: "Verify + patch the null guard",
        },
      },
    }
    const out = renderIssue(triaged)
    expect(out).toContain("triage")
    expect(out).toContain("verdict:")
    expect(out).toContain("actionable")
    expect(out).toContain("context")
    expect(out).toContain("surrounding context here")
    expect(out).toContain("suggested fix")
    expect(out).toContain("guard the call")
    expect(out).toContain("if (x) x.trim()")
    expect(out).toContain("prompt for ai agents")
    expect(out).toContain("Verify + patch the null guard")
  })
})

describe("issue detail · buildCopyPrompt", () => {
  it("returns the enrichment promptForAgents verbatim when present", () => {
    const triaged: ReviewIssue = {
      ...issue,
      triage: {
        verdict: "actionable",
        reasoning: "real bug",
        enrichment: {
          title: "Null deref",
          context: "...",
          minimalFix: { summary: "guard", patch: "if (x) x.trim()" },
          promptForAgents: "Verify + patch the null guard",
        },
      },
    }
    expect(buildCopyPrompt(triaged)).toBe("Verify + patch the null guard")
  })

  it("returns an empty string when enrichment is missing", () => {
    expect(buildCopyPrompt(issue)).toBe("")
  })
})
