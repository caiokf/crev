import { describe, expect, it, vi, beforeEach } from "vitest"
import type { ReviewIssue, ReviewResult } from "./types.js"
import {
  applyFixStatuses,
  buildFixPrompt,
  parseFixResponse,
  runFix,
  type FixStatus,
} from "./fix.js"

const valetMocks = vi.hoisted(() => ({
  getRuntime: vi.fn(),
}))

vi.mock("@caiokf/valet", () => ({
  getRuntime: valetMocks.getRuntime,
}))

// ── parseFixResponse ──

describe("fix · parseFixResponse", () => {
  it("parses a well-formed fixed response", () => {
    const raw = JSON.stringify({
      fix: { id: "i-1", status: "fixed", reasoning: "patched the null check" },
    })
    const result = parseFixResponse(raw, "i-1")
    expect(result).toEqual({
      id: "i-1",
      status: "fixed",
      reasoning: "patched the null check",
    })
  })

  it("parses a failed response", () => {
    const raw = JSON.stringify({
      fix: { id: "i-1", status: "failed", reasoning: "file not found" },
    })
    const result = parseFixResponse(raw, "i-1")
    expect(result.status).toBe("failed")
  })

  it("defaults unknown status to fixed", () => {
    const raw = JSON.stringify({
      fix: { id: "i-1", status: "partial", reasoning: "some work done" },
    })
    const result = parseFixResponse(raw, "i-1")
    expect(result.status).toBe("fixed")
  })

  it("extracts JSON embedded in text", () => {
    const raw = `I've made the changes.\n\n${JSON.stringify({
      fix: { id: "i-1", status: "fixed", reasoning: "done" },
    })}\n\nAll done.`
    const result = parseFixResponse(raw, "i-1")
    expect(result.status).toBe("fixed")
    expect(result.reasoning).toBe("done")
  })

  it("assumes fixed when agent produces output but no JSON", () => {
    const raw = "I updated the file src/foo.ts to add the null check."
    const result = parseFixResponse(raw, "i-1")
    expect(result.status).toBe("fixed")
    expect(result.reasoning).toContain("without structured response")
  })

  it("returns failed for empty output", () => {
    const result = parseFixResponse("", "i-1")
    expect(result.status).toBe("failed")
    expect(result.reasoning).toContain("no output")
  })

  it("uses the provided issueId, not the one in the JSON", () => {
    const raw = JSON.stringify({
      fix: { id: "wrong-id", status: "fixed", reasoning: "done" },
    })
    const result = parseFixResponse(raw, "correct-id")
    expect(result.id).toBe("correct-id")
  })
})

// ── buildFixPrompt ──

describe("fix · buildFixPrompt", () => {
  const baseIssue: ReviewIssue = {
    id: "i-1",
    reviewer: "Engineer",
    runtime: "claude",
    model: "sonnet",
    file: "src/foo.ts",
    line: 42,
    severity: "high",
    category: "bug",
    title: "Null deref",
    description: "calling .trim() on undefined",
    triage: {
      verdict: "actionable",
      reasoning: "real bug",
      enrichment: {
        title: "Fix null deref",
        context: "val can be undefined",
        minimalFix: {
          summary: "Add null check before .trim()",
          language: "diff",
          patch: "- val.trim()\n+ val?.trim()",
        },
        promptForAgents: "Add a null check before calling .trim() on val in src/foo.ts:42",
      },
    },
  }

  it("includes issue details and file location", () => {
    const prompt = buildFixPrompt(baseIssue, "Fix the null check")
    expect(prompt).toContain("Null deref")
    expect(prompt).toContain("src/foo.ts:42")
    expect(prompt).toContain("calling .trim() on undefined")
    expect(prompt).toContain("high/bug")
  })

  it("includes the agent prompt", () => {
    const prompt = buildFixPrompt(baseIssue, "Add a null check before calling .trim()")
    expect(prompt).toContain("Add a null check before calling .trim()")
  })

  it("includes the suggested fix from enrichment", () => {
    const prompt = buildFixPrompt(baseIssue, "Fix it")
    expect(prompt).toContain("Add null check before .trim()")
  })

  it("handles issues without a file", () => {
    const noFile = { ...baseIssue, file: undefined, line: undefined }
    const prompt = buildFixPrompt(noFile, "Fix it")
    expect(prompt).toContain("No specific file")
  })

  it("handles issues without enrichment minimalFix", () => {
    const noFix: ReviewIssue = {
      ...baseIssue,
      triage: {
        verdict: "actionable",
        reasoning: "real bug",
        enrichment: {
          title: "Fix null deref",
          context: "val can be undefined",
          minimalFix: { summary: "", patch: "" },
          promptForAgents: "Fix it",
        },
      },
    }
    const prompt = buildFixPrompt(noFix, "Fix it")
    // Should not crash, should still contain instructions
    expect(prompt).toContain("Instructions")
  })

  it("includes the issue id in the JSON response template", () => {
    const prompt = buildFixPrompt(baseIssue, "Fix it")
    expect(prompt).toContain('"i-1"')
  })
})

// ── applyFixStatuses ──

describe("fix · applyFixStatuses", () => {
  const makeResult = (issues: ReviewIssue[]): ReviewResult => ({
    metadata: {
      slug: "test",
      timestamp: "2026-04-25T00:00:00Z",
      schema: "quick",
      diffType: "all",
    },
    reviews: [
      {
        reviewer: "Engineer",
        runtime: "claude",
        model: "sonnet",
        durationMs: 100,
        exitCode: 0,
        rawLength: 50,
        issues,
      },
    ],
    summary: {
      totalIssues: issues.length,
      bySeverity: {},
      byCategory: {},
      byReviewer: {},
    },
  })

  it("updates status to fixed for matched issues", () => {
    const issues: ReviewIssue[] = [
      {
        id: "i-1",
        reviewer: "E",
        runtime: "claude",
        model: "sonnet",
        severity: "high",
        category: "bug",
        title: "Bug",
        description: "d",
      },
      {
        id: "i-2",
        reviewer: "E",
        runtime: "claude",
        model: "sonnet",
        severity: "low",
        category: "style",
        title: "Style",
        description: "d",
      },
    ]
    const result = makeResult(issues)
    const statuses: FixStatus[] = [
      { id: "i-1", status: "fixed", reasoning: "patched" },
      { id: "i-2", status: "failed", reasoning: "could not fix" },
    ]

    applyFixStatuses(result, statuses)

    expect(result.reviews[0].issues[0].status).toBe("fixed")
    // failed issues should NOT be marked as fixed
    expect(result.reviews[0].issues[1].status).toBeUndefined()
  })

  it("does not touch issues without a matching status", () => {
    const issues: ReviewIssue[] = [
      {
        id: "i-1",
        reviewer: "E",
        runtime: "claude",
        model: "sonnet",
        severity: "high",
        category: "bug",
        title: "Bug",
        description: "d",
        status: "open",
      },
    ]
    const result = makeResult(issues)
    applyFixStatuses(result, [])

    expect(result.reviews[0].issues[0].status).toBe("open")
  })

  it("only sets fixed status, ignores skipped", () => {
    const issues: ReviewIssue[] = [
      {
        id: "i-1",
        reviewer: "E",
        runtime: "claude",
        model: "sonnet",
        severity: "high",
        category: "bug",
        title: "Bug",
        description: "d",
      },
    ]
    const result = makeResult(issues)
    applyFixStatuses(result, [
      { id: "i-1", status: "skipped", reasoning: "no prompt" },
    ])

    expect(result.reviews[0].issues[0].status).toBeUndefined()
  })
})

// ── runFix · runtime config forwarding ──

describe("fix · runFix runtime config", () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  const issueWithPrompt: ReviewIssue = {
    id: "i-1",
    reviewer: "E",
    runtime: "claude",
    model: "sonnet",
    severity: "high",
    category: "bug",
    title: "Bug",
    description: "desc",
    triage: {
      verdict: "actionable",
      reasoning: "real",
      enrichment: {
        title: "Fix it",
        context: "context",
        minimalFix: { summary: "add check", patch: "+ if (x) {}" },
        promptForAgents: "Add a null check",
      },
    },
  }

  it("forwards runtimeConfig to the LLM call", async () => {
    const execute = vi.fn().mockResolvedValue({
      raw: JSON.stringify({ fix: { id: "i-1", status: "fixed", reasoning: "done" } }),
      durationMs: 10,
      exitCode: 0,
    })
    valetMocks.getRuntime.mockReturnValue({ execute })

    await runFix({
      issues: [issueWithPrompt],
      runtime: "claude",
      model: "claude-opus-4-6",
      runtimeConfig: {
        command: "/usr/local/bin/claude",
        env: { KEY: "val" },
        args: ["--timeout", "30"],
      },
    })

    expect(execute).toHaveBeenCalledTimes(1)
    expect(execute.mock.calls[0][0].model).toBe("claude-opus-4-6")
    expect(execute.mock.calls[0][0].overrides).toEqual(
      expect.objectContaining({
        command: "/usr/local/bin/claude",
        env: { KEY: "val" },
        extraArgs: ["--timeout", "30"],
      }),
    )
  })

  it("works without runtimeConfig (backward compatible)", async () => {
    const execute = vi.fn().mockResolvedValue({
      raw: JSON.stringify({ fix: { id: "i-1", status: "fixed", reasoning: "done" } }),
      durationMs: 10,
      exitCode: 0,
    })
    valetMocks.getRuntime.mockReturnValue({ execute })

    const result = await runFix({
      issues: [issueWithPrompt],
      runtime: "claude",
      model: "sonnet",
    })

    expect(result.summary.fixed).toBe(1)
    expect(execute.mock.calls[0][0].overrides).toBeUndefined()
  })

  it("skips issues without enrichment prompt", async () => {
    const execute = vi.fn()
    valetMocks.getRuntime.mockReturnValue({ execute })

    const issueNoPrompt: ReviewIssue = {
      id: "i-2",
      reviewer: "E",
      runtime: "claude",
      model: "sonnet",
      severity: "low",
      category: "style",
      title: "Style",
      description: "d",
    }

    const result = await runFix({
      issues: [issueNoPrompt],
      runtime: "claude",
      model: "sonnet",
      runtimeConfig: { command: "/bin/claude" },
    })

    expect(result.summary.skipped).toBe(1)
    expect(execute).not.toHaveBeenCalled()
  })
})
