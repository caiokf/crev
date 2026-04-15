import { describe, expect, it } from "vitest"
import { filterDiff } from "./diff.js"

describe("filterDiff", () => {
  const sampleDiff = [
    "diff --git a/src/index.ts b/src/index.ts",
    "--- a/src/index.ts",
    "+++ b/src/index.ts",
    "@@ -1,3 +1,4 @@",
    " import foo",
    "+import bar",
    "diff --git a/pnpm-lock.yaml b/pnpm-lock.yaml",
    "--- a/pnpm-lock.yaml",
    "+++ b/pnpm-lock.yaml",
    "@@ -1,100 +1,200 @@",
    " lockfileVersion: 9",
    "+some change",
    "diff --git a/src/test.snap b/src/test.snap",
    "--- a/src/test.snap",
    "+++ b/src/test.snap",
    "@@ -1 +1 @@",
    "-old snapshot",
    "+new snapshot",
  ].join("\n")

  it("filters out exact filename matches", () => {
    const result = filterDiff(sampleDiff, ["pnpm-lock.yaml"])
    expect(result).toContain("src/index.ts")
    expect(result).not.toContain("pnpm-lock.yaml")
    expect(result).toContain("test.snap")
  })

  it("filters out glob extension patterns", () => {
    const result = filterDiff(sampleDiff, ["*.snap"])
    expect(result).toContain("src/index.ts")
    expect(result).toContain("pnpm-lock.yaml")
    expect(result).not.toContain("test.snap")
  })

  it("filters out recursive glob patterns", () => {
    const result = filterDiff(sampleDiff, ["**/*.snap"])
    expect(result).not.toContain("test.snap")
    expect(result).toContain("src/index.ts")
  })

  it("handles multiple patterns", () => {
    const result = filterDiff(sampleDiff, ["pnpm-lock.yaml", "**/*.snap"])
    expect(result).toContain("src/index.ts")
    expect(result).not.toContain("pnpm-lock.yaml")
    expect(result).not.toContain("test.snap")
  })

  it("returns unchanged diff when no patterns match", () => {
    const result = filterDiff(sampleDiff, ["nonexistent.txt"])
    expect(result).toBe(sampleDiff)
  })
})
