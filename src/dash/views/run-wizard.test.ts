import { describe, expect, it } from "vitest"
import { DIFF_CHOICES, formatDiff, renderRunning } from "./run-wizard.js"

describe("wizard · DIFF_CHOICES", () => {
  it("builds uncommitted local diff", () => {
    const d = DIFF_CHOICES[0]!.build("main")
    expect(d).toEqual({ diff: { kind: "local", type: "uncommitted" }, analyze: false })
  })

  it("builds branch diff using the supplied base", () => {
    const d = DIFF_CHOICES[2]!.build("release")
    expect(d).toEqual({ diff: { kind: "branch", base: "release", type: "all" }, analyze: false })
  })

  it("exposes a full-repo analysis choice", () => {
    const choice = DIFF_CHOICES.find((c) => c.label.includes("analyze"))
    expect(choice).toBeDefined()
    expect(choice!.build("main").analyze).toBe(true)
  })
})

describe("wizard · formatDiff", () => {
  it("formats each diff kind", () => {
    expect(formatDiff({ kind: "local", type: "all" })).toBe("local all")
    expect(formatDiff({ kind: "branch", base: "main", type: "committed" })).toBe(
      "branch vs main (committed)",
    )
    expect(formatDiff({ kind: "pr", pr: 42 })).toBe("PR #42")
    expect(formatDiff({ kind: "commit", baseCommit: "abc", type: "all" })).toBe(
      "commit abc (all)",
    )
  })
})

describe("wizard · renderRunning", () => {
  it("shows schema, diff, and an elapsed counter", () => {
    const phase = {
      kind: "running" as const,
      schema: "quick",
      diff: { kind: "local" as const, type: "all" as const },
      analyze: false,
      startedAt: Date.now() - 2500,
    }
    const out = renderRunning(phase)
    expect(out).toContain("quick")
    expect(out).toContain("local all")
    expect(out).toMatch(/elapsed:\s+\ds/)
  })

  it("labels the diff line as full-repo analysis when analyze is true", () => {
    const phase = {
      kind: "running" as const,
      schema: "quick",
      diff: { kind: "local" as const, type: "all" as const },
      analyze: true,
      startedAt: Date.now(),
    }
    expect(renderRunning(phase)).toContain("full repo analysis")
  })
})
