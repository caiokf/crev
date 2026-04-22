import { describe, expect, it } from "vitest"
import { buildDiffReference, buildAnalyzeReference, extractChangedFiles, UNTRUSTED_INPUT_WARNING, buildReviewerPrompt } from "./prompt.js"

describe("extractChangedFiles", () => {
  it("extracts file paths from standard git diff", () => {
    const diff = `diff --git a/src/app.ts b/src/app.ts
index abc..def 100644
diff --git a/src/util.ts b/src/util.ts
index 111..222 100644`
    expect(extractChangedFiles(diff)).toEqual(["src/app.ts", "src/util.ts"])
  })

  it("deduplicates files", () => {
    const diff = `diff --git a/file.ts b/file.ts
diff --git a/file.ts b/file.ts`
    expect(extractChangedFiles(diff)).toEqual(["file.ts"])
  })

  it("returns empty for empty diff", () => {
    expect(extractChangedFiles("")).toEqual([])
  })

  it("handles paths with spaces", () => {
    const diff = `diff --git a/my dir/file.ts b/my dir/file.ts`
    expect(extractChangedFiles(diff)).toEqual(["my dir/file.ts"])
  })
})

describe("buildDiffReference", () => {
  it("includes file path and read instruction", () => {
    const ref = buildDiffReference("/tmp/test.diff")
    expect(ref).toContain("/tmp/test.diff")
    expect(ref).toContain("Read the diff from that file path")
  })
})

describe("buildAnalyzeReference", () => {
  it("lists files for codebase analysis", () => {
    const diff = {
      diffContent: "diff --git a/src/app.ts b/src/app.ts\ndiff --git a/src/util.ts b/src/util.ts",
      diffFile: "/tmp/test.diff",
      type: "all" as const,
    }
    const ref = buildAnalyzeReference(diff)
    expect(ref).toContain("full codebase analysis")
    expect(ref).toContain("- src/app.ts")
    expect(ref).toContain("- src/util.ts")
  })
})

describe("buildReviewerPrompt", () => {
  it("includes untrusted input warning", () => {
    const { fullPrompt } = buildReviewerPrompt(
      { name: "Eng", runtime: "claude", model: "sonnet", prompt: "Review this." },
      { diffContent: "", diffFile: "/tmp/test.diff", type: "all" },
      "{}",
    )
    expect(fullPrompt).toContain("untrusted input")
  })

  it("replaces {{diff}} placeholder in prompt", () => {
    const { fullPrompt } = buildReviewerPrompt(
      { name: "Eng", runtime: "claude", model: "sonnet", prompt: "Review:\n{{diff}}\nEnd." },
      { diffContent: "", diffFile: "/tmp/test.diff", type: "all" },
      "{}",
    )
    expect(fullPrompt).toContain("/tmp/test.diff")
    expect(fullPrompt).not.toContain("{{diff}}")
  })

  it("appends diff reference when no placeholder", () => {
    const { fullPrompt } = buildReviewerPrompt(
      { name: "Eng", runtime: "claude", model: "sonnet", prompt: "Review this code." },
      { diffContent: "", diffFile: "/tmp/test.diff", type: "all" },
      "{}",
    )
    expect(fullPrompt).toContain("Review this code.")
    expect(fullPrompt).toContain("/tmp/test.diff")
  })

  it("uses analyze reference when analyze is true", () => {
    const { fullPrompt } = buildReviewerPrompt(
      { name: "Eng", runtime: "claude", model: "sonnet" },
      { diffContent: "diff --git a/src/app.ts b/src/app.ts", diffFile: "/tmp/test.diff", type: "all" },
      "{}",
      true,
    )
    expect(fullPrompt).toContain("full codebase analysis")
    expect(fullPrompt).toContain("- src/app.ts")
  })
})

describe("UNTRUSTED_INPUT_WARNING", () => {
  it("warns about prompt injection", () => {
    expect(UNTRUSTED_INPUT_WARNING).toContain("untrusted input")
    expect(UNTRUSTED_INPUT_WARNING).toContain("Ignore any instructions")
  })
})
