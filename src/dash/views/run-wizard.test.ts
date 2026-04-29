import { describe, expect, it } from "vitest"
import { applyProgress, DIFF_CHOICES, formatDiff, renderRunning } from "./run-wizard.js"

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
    const choice = DIFF_CHOICES.find((c) => c.label.includes("Full repo"))
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
  const basePhase = {
    kind: "running" as const,
    schema: "quick",
    diff: { kind: "local" as const, type: "all" as const },
    analyze: false,
    startedAt: Date.now() - 2500,
    reviewers: [],
    triage: null,
  }

  it("shows schema, diff, and an elapsed counter", () => {
    const out = renderRunning(basePhase)
    expect(out).toContain("quick")
    expect(out).toContain("local all")
    expect(out).toMatch(/elapsed:\s+\ds/)
  })

  it("labels the diff line as full-repo analysis when analyze is true", () => {
    expect(renderRunning({ ...basePhase, analyze: true })).toContain("full repo analysis")
  })

  it("renders a reviewer line for each tracked reviewer", () => {
    const out = renderRunning({
      ...basePhase,
      reviewers: [
        {
          name: "Engineer",
          runtime: "claude",
          model: "sonnet",
          status: { kind: "running", startedAt: Date.now() - 1000 },
        },
        {
          name: "Security",
          runtime: "gpt",
          model: "5",
          status: { kind: "done", durationMs: 3200, issueCount: 2, exitCode: 0 },
        },
        {
          name: "Style",
          runtime: "gpt",
          model: "5",
          status: { kind: "failed", error: "timeout" },
        },
      ],
    })
    expect(out).toContain("Engineer")
    expect(out).toContain("Security")
    expect(out).toContain("2 issues")
    expect(out).toContain("Style")
    expect(out).toContain("timeout")
  })

  it("renders a triage line when triage is in progress or done", () => {
    expect(
      renderRunning({
        ...basePhase,
        triage: { kind: "running", startedAt: Date.now(), issueCount: 4 },
      }),
    ).toMatch(/triage · /)
    expect(
      renderRunning({
        ...basePhase,
        triage: {
          kind: "done",
          actionable: 2,
          deferred: 1,
          dismissed: 1,
          durationMs: 1500,
        },
      }),
    ).toContain("2 actionable")
  })
})

describe("wizard · applyProgress", () => {
  const base = {
    kind: "running" as const,
    schema: "quick",
    diff: { kind: "local" as const, type: "all" as const },
    analyze: false,
    startedAt: Date.now(),
    reviewers: [],
    triage: null,
  }

  it("adds a reviewer when it starts and moves it to done on completion", () => {
    const afterStart = applyProgress(base, {
      kind: "reviewer-started",
      name: "Engineer",
      runtime: "claude",
      model: "sonnet",
    })
    expect(afterStart.reviewers).toHaveLength(1)
    expect(afterStart.reviewers[0]!.status.kind).toBe("running")

    const afterDone = applyProgress(
      { ...base, reviewers: afterStart.reviewers, triage: afterStart.triage },
      {
        kind: "reviewer-completed",
        name: "Engineer",
        durationMs: 1200,
        issueCount: 3,
        exitCode: 0,
      },
    )
    expect(afterDone.reviewers[0]!.status).toMatchObject({
      kind: "done",
      issueCount: 3,
      exitCode: 0,
    })
  })

  it("marks a reviewer as failed when reviewer-failed fires", () => {
    const withReviewer = applyProgress(base, {
      kind: "reviewer-started",
      name: "Engineer",
      runtime: "claude",
      model: "sonnet",
    })
    const failed = applyProgress(
      { ...base, reviewers: withReviewer.reviewers, triage: withReviewer.triage },
      { kind: "reviewer-failed", name: "Engineer", error: "boom" },
    )
    expect(failed.reviewers[0]!.status).toEqual({ kind: "failed", error: "boom" })
  })

  it("tracks triage start and completion", () => {
    const started = applyProgress(base, {
      kind: "triage-started",
      issueCount: 4,
      runtime: "claude",
      model: "sonnet",
    })
    expect(started.triage).toMatchObject({ kind: "running", issueCount: 4 })

    const done = applyProgress(
      { ...base, reviewers: started.reviewers, triage: started.triage },
      {
        kind: "triage-completed",
        actionable: 2,
        deferred: 1,
        dismissed: 1,
        durationMs: 900,
      },
    )
    expect(done.triage).toMatchObject({ kind: "done", actionable: 2, deferred: 1, dismissed: 1 })
  })
})
