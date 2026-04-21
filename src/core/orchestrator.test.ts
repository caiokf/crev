import { describe, expect, it } from "vitest"
import path from "node:path"
import { extractChangedFiles, buildAnalyzeReference, buildDiffReference, validateReviewFilePath, filterReviewers, recomputeSummary, buildPromptOnlyResult } from "./orchestrator.js"
import type { ReviewerConfig } from "./schema.js"
import type { NormalizedReview, ReviewIssue } from "./types.js"

describe("extractChangedFiles", () => {
  it("extracts file paths from standard git diff", () => {
    const diff = `diff --git a/packages/cli/src/commands/init.ts b/packages/cli/src/commands/init.ts
index abc123..def456 100644
--- a/packages/cli/src/commands/init.ts
+++ b/packages/cli/src/commands/init.ts
@@ -1,5 +1,6 @@
+import something
 existing code
diff --git a/packages/cli/src/core/schema.ts b/packages/cli/src/core/schema.ts
index 111222..333444 100644
--- a/packages/cli/src/core/schema.ts
+++ b/packages/cli/src/core/schema.ts
@@ -10,3 +10,4 @@
+new line`
    const files = extractChangedFiles(diff)
    expect(files).toEqual([
      "packages/cli/src/commands/init.ts",
      "packages/cli/src/core/schema.ts",
    ])
  })

  it("deduplicates renamed files", () => {
    const diff = `diff --git a/old.ts b/new.ts
similarity index 90%
rename from old.ts
rename to new.ts
diff --git a/old.ts b/old.ts
deleted file mode 100644`
    const files = extractChangedFiles(diff)
    expect(files).toContain("old.ts")
  })

  it("returns empty array for empty diff", () => {
    expect(extractChangedFiles("")).toEqual([])
  })

  it("returns empty array for diff with no file headers", () => {
    expect(extractChangedFiles("just some random text\n")).toEqual([])
  })

  it("handles paths with spaces", () => {
    const diff = `diff --git a/my dir/file.ts b/my dir/file.ts`
    const files = extractChangedFiles(diff)
    expect(files).toEqual(["my dir/file.ts"])
  })
})

describe("buildDiffReference", () => {
  it("includes the diff file path", () => {
    const ref = buildDiffReference("/tmp/some-diff.diff")
    expect(ref).toContain("/tmp/some-diff.diff")
    expect(ref).toContain("Read the diff from that file path")
  })
})

describe("buildAnalyzeReference", () => {
  it("lists files and instructs reading from filesystem", () => {
    const diff = {
      diffContent: `diff --git a/src/app.ts b/src/app.ts\ndiff --git a/src/util.ts b/src/util.ts`,
      diffFile: "/tmp/test.diff",
      type: "all" as const,
    }
    const result = buildAnalyzeReference(diff)
    expect(result).toContain("full codebase analysis")
    expect(result).toContain("- src/app.ts")
    expect(result).toContain("- src/util.ts")
    expect(result).toContain("Read each file from the filesystem")
  })

  it("returns empty file list for empty diff", () => {
    const diff = {
      diffContent: "",
      diffFile: "/tmp/test.diff",
      type: "all" as const,
    }
    const result = buildAnalyzeReference(diff)
    expect(result).toContain("full codebase analysis")
    expect(result).not.toContain("- ")
  })
})

describe("filterReviewers", () => {
  const reviewers: ReviewerConfig[] = [
    { name: "Security", runtime: "claude", model: "opus" },
    { name: "Engineer", runtime: "claude", model: "sonnet" },
    { name: "Architect", runtime: "gemini", model: "gemini-2.5-pro" },
  ]

  it("returns all reviewers when no filter", () => {
    expect(filterReviewers(reviewers)).toEqual(reviewers)
    expect(filterReviewers(reviewers, [])).toEqual(reviewers)
  })

  it('["all"] returns all reviewers', () => {
    expect(filterReviewers(reviewers, ["all"])).toEqual(reviewers)
  })

  it("case-insensitive match", () => {
    const result = filterReviewers(reviewers, ["security"])
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe("Security")
  })

  it("filter with no matches returns empty", () => {
    expect(filterReviewers(reviewers, ["Nonexistent"])).toEqual([])
  })

  it("trims whitespace in filter values", () => {
    const result = filterReviewers(reviewers, ["  security  "])
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe("Security")
  })
})

describe("buildPromptOnlyResult", () => {
  it("returns generated prompts and metadata without running reviewers", () => {
    const result = buildPromptOnlyResult({
      schema: {
        reviewers: [
          {
            name: "Engineer",
            runtime: "claude",
            model: "sonnet",
            prompt: "Please review this diff:\n{{diff}}",
          },
        ],
      },
      schemaName: "quick",
      schemaHash: "abc12345",
      config: {} as any,
      diff: {
        diffContent: "diff --git a/src/app.ts b/src/app.ts",
        diffFile: "/tmp/test.diff",
        type: "all",
        base: "main",
      },
      slug: "feature-branch",
      crevDir: "/tmp",
    })

    expect(result.metadata.schema).toBe("quick")
    expect(result.metadata.schemaHash).toBe("abc12345")
    expect(result.metadata.diffType).toBe("all")
    expect(result.metadata.diffBase).toBe("main")
    expect(result.prompts).toHaveLength(1)
    expect(result.prompts[0].reviewer).toBe("Engineer")
    expect(result.prompts[0].runtime).toBe("claude")
    expect(result.prompts[0].model).toBe("sonnet")
    expect(result.prompts[0].prompt).toContain("/tmp/test.diff")
    expect(result.prompts[0].prompt).toContain("Respond with valid JSON matching this schema")
  })
})

describe("recomputeSummary", () => {
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

  it("zero reviews returns empty summary", () => {
    const summary = recomputeSummary([])
    expect(summary.totalIssues).toBe(0)
    expect(summary.bySeverity).toEqual({})
    expect(summary.byCategory).toEqual({})
    expect(summary.byReviewer).toEqual({})
    expect(summary.triage).toBeUndefined()
  })

  it("mixed severities and categories are counted correctly", () => {
    const reviews = [makeReview({
      issues: [
        makeIssue({ severity: "high", category: "security" }),
        makeIssue({ id: "test--2", severity: "low", category: "style" }),
        makeIssue({ id: "test--3", severity: "high", category: "bug" }),
      ],
    })]
    const summary = recomputeSummary(reviews)
    expect(summary.totalIssues).toBe(3)
    expect(summary.bySeverity).toEqual({ high: 2, low: 1 })
    expect(summary.byCategory).toEqual({ security: 1, style: 1, bug: 1 })
  })

  it("multiple reviewers counted in byReviewer", () => {
    const reviews = [
      makeReview({ reviewer: "Security", issues: [makeIssue({ reviewer: "Security" })] }),
      makeReview({ reviewer: "Engineer", issues: [makeIssue({ id: "eng--1", reviewer: "Engineer" }), makeIssue({ id: "eng--2", reviewer: "Engineer" })] }),
    ]
    const summary = recomputeSummary(reviews)
    expect(summary.byReviewer).toEqual({ Security: 1, Engineer: 2 })
  })

  it("issues with triage produce triage summary", () => {
    const reviews = [makeReview({
      issues: [
        makeIssue({ triage: { verdict: "actionable", reasoning: "real" } }),
        makeIssue({ id: "test--2", triage: { verdict: "dismissed", reasoning: "noise" } }),
        makeIssue({ id: "test--3", triage: { verdict: "deferred", reasoning: "later" } }),
      ],
    })]
    const summary = recomputeSummary(reviews)
    expect(summary.triage).toEqual({ actionable: 1, deferred: 1, dismissed: 1 })
  })

  it("issues without triage return undefined triage", () => {
    const reviews = [makeReview({ issues: [makeIssue()] })]
    const summary = recomputeSummary(reviews)
    expect(summary.triage).toBeUndefined()
  })
})

describe("validateReviewFilePath", () => {
  it("accepts paths within the project root", () => {
    const result = validateReviewFilePath(".crev/reviews/test.json", "/project")
    expect(result).toBe(path.resolve("/project", ".crev/reviews/test.json"))
  })

  it("accepts nested subdirectory paths", () => {
    const result = validateReviewFilePath("deep/nested/file.json", "/project")
    expect(result).toBe(path.resolve("/project", "deep/nested/file.json"))
  })

  it("rejects paths that escape the project root via ../", () => {
    expect(() => {
      validateReviewFilePath("../../etc/passwd", "/project/sub")
    }).toThrow("resolves outside the project root")
  })

  it("rejects absolute paths outside the project", () => {
    expect(() => {
      validateReviewFilePath("/tmp/evil.json", "/project")
    }).toThrow("resolves outside the project root")
  })

  it("accepts absolute paths inside the project", () => {
    const result = validateReviewFilePath("/project/reviews/test.json", "/project")
    expect(result).toBe("/project/reviews/test.json")
  })
})
