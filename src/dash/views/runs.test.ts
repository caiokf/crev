import { describe, expect, it } from "vitest"
import { computeColumnWidths, formatRow as formatRunRow, matchesFilter } from "./runs-list.js"
import { actionableMarker, computeIssueWidths, flattenIssues, formatIssueRow, renderMeta, ISSUE_LIST_OPTIONS } from "./run-detail.js"
import { buildCopyPrompt, findIssue, formatCodeBlock, formatDiff, renderIssue } from "./issue-detail.js"
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

describe("runs list · matchesFilter", () => {
  const row = {
    filePath: "/repo/.crev/reviews/test.json",
    slug: "add-feature",
    schema: "quick",
    timestamp: "2026-04-23T12:34:56Z",
    totalIssues: 2,
    reviewers: 1,
  }

  it("matches on slug substring (case-insensitive)", () => {
    expect(matchesFilter(row, "feat")).toBe(true)
    expect(matchesFilter(row, "ADD")).toBe(true)
  })

  it("matches on schema substring", () => {
    expect(matchesFilter(row, "qui")).toBe(true)
  })

  it("matches on description when present", () => {
    expect(matchesFilter({ ...row, description: "fixing login bug" }, "login")).toBe(true)
  })

  it("returns false when nothing matches", () => {
    expect(matchesFilter(row, "nonexistent")).toBe(false)
  })

  it("handles missing description gracefully", () => {
    expect(matchesFilter(row, "anything")).toBe(false)
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

  it("prepends a coloured dot per verdict (green/yellow/gray) and preserves alignment", () => {
    const actionableIssue: ReviewIssue = {
      ...issue,
      triage: { verdict: "actionable", reasoning: "real bug" },
    }
    const deferredIssue: ReviewIssue = {
      ...issue,
      id: "i-def",
      triage: { verdict: "deferred", reasoning: "later" },
    }
    const dismissedIssue: ReviewIssue = {
      ...issue,
      id: "i-dis",
      triage: { verdict: "dismissed", reasoning: "false positive" },
    }
    const widths = computeIssueWidths([issue, actionableIssue, deferredIssue, dismissedIssue])
    const plain = formatIssueRow(issue, widths)
    const actionable = formatIssueRow(actionableIssue, widths)
    const deferred = formatIssueRow(deferredIssue, widths)
    const dismissed = formatIssueRow(dismissedIssue, widths)

    // Verdict dots use the sidebar palette: green/yellow/gray.
    expect(actionable).toContain("{green-fg}●")
    expect(deferred).toContain("{yellow-fg}●")
    expect(dismissed).toContain("{gray-fg}●")
    expect(plain).not.toContain("●")

    // Severity tag should sit at the same visible column across all four
    // rows — dots must not shift the layout.
    const stripTags = (s: string) => s.replace(/\{[^}]+\}/g, "")
    const col = stripTags(plain).indexOf("HIGH")
    expect(col).toBeGreaterThan(0)
    expect(stripTags(actionable).indexOf("HIGH")).toBe(col)
    expect(stripTags(deferred).indexOf("HIGH")).toBe(col)
    expect(stripTags(dismissed).indexOf("HIGH")).toBe(col)
  })

  it("shows green checkmark for fixed issues", () => {
    const fixedIssue: ReviewIssue = { ...issue, status: "fixed" }
    const row = formatIssueRow(fixedIssue, computeIssueWidths([fixedIssue]))
    expect(row).toContain("{green-fg}✓")
    expect(row).not.toContain("●")
  })

  it("shows gray ✗ for wont-fix issues", () => {
    const wontFix: ReviewIssue = { ...issue, status: "wont-fix" }
    const row = formatIssueRow(wontFix, computeIssueWidths([wontFix]))
    expect(row).toContain("{gray-fg}✗")
    expect(row).not.toContain("●")
  })

  it("fixed status takes priority over triage verdict", () => {
    const fixedActionable: ReviewIssue = {
      ...issue,
      status: "fixed",
      triage: { verdict: "actionable", reasoning: "real bug" },
    }
    const marker = actionableMarker(fixedActionable)
    expect(marker).toContain("✓")
    expect(marker).not.toContain("●")
  })

  it("disables invertSelected so inline color tags survive on the selected row", () => {
    expect(ISSUE_LIST_OPTIONS.invertSelected).toBe(false)
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

  it("escapes `{...}` in user-controlled text so blessed doesn't parse it as tags", () => {
    const tricky: ReviewIssue = {
      ...issue,
      title: "Unsanitised {green-fg}tags{/green-fg} in output",
      description: "Literal braces like {accent-fg} must survive as-is, not colour the panel.",
    }
    const out = renderIssue(tricky)
    // user braces are escaped to {open}/{close} so blessed treats them
    // as literal text, not color directives
    expect(out).toContain("{open}green-fg{close}")
    expect(out).toContain("{open}accent-fg{close}")
    // the unescaped `{green-fg}` from the user string should never land
    // in the output; the legit section-header `{cyan-fg}` is fine
    expect(out).not.toContain("{green-fg}")
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

describe("issue detail · formatDiff", () => {
  it("paints + lines green and - lines red with contrasting backgrounds", () => {
    const patch = ["- const old = 1", "+ const next = 2"].join("\n")
    const out = formatDiff(patch)
    expect(out).toContain("{green-fg}")
    expect(out).toContain("{red-fg}")
    // background tints present
    expect(out).toMatch(/#[0-9a-f]{6}-bg/i)
  })

  it("dims file-header and context lines and tints hunk markers", () => {
    const patch = [
      "--- a/foo.ts",
      "+++ b/foo.ts",
      "@@ -1,2 +1,2 @@",
      " unchanged line",
      "- removed",
      "+ added",
    ].join("\n")
    const out = formatDiff(patch)
    expect(out).toContain("@@ -1,2 +1,2 @@")
    // file headers are bold gray
    expect(out).toMatch(/\{gray-fg\}\{bold\}--- a\/foo\.ts/)
    // hunk header uses cyan foreground
    expect(out).toContain("{cyan-fg}@@ -1,2 +1,2 @@")
  })
})

describe("issue detail · formatCodeBlock", () => {
  it("delegates to formatDiff for diff language", () => {
    const out = formatCodeBlock("+ added", "diff")
    expect(out).toContain("{green-fg}")
  })

  it("wraps non-diff code in accent color", () => {
    const out = formatCodeBlock("const x = 1", "ts")
    expect(out).toContain("{cyan-fg}")
    expect(out).toContain("const x = 1")
  })

  it("escapes blessed tags in non-diff code", () => {
    const out = formatCodeBlock("{bold}not a tag{/bold}", "js")
    expect(out).toContain("{open}bold{close}")
  })
})
