import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { ReviewIssue, ReviewResult } from "./types.js"
import {
  applyVerifyStatuses,
  buildVerifyPrompt,
  parseVerifyResponse,
  readFileContext,
  runVerify,
  type VerifyStatus,
} from "./verify.js"

const valetMocks = vi.hoisted(() => ({
  getRuntime: vi.fn(),
}))

vi.mock("@caiokf/valet", () => ({
  getRuntime: valetMocks.getRuntime,
}))

// ── parseVerifyResponse ──

describe("verify · parseVerifyResponse", () => {
  it("parses a well-formed response", () => {
    const raw = JSON.stringify({
      verify: [
        { id: "i-1", status: "fixed", reasoning: "code was changed" },
        { id: "i-2", status: "open", reasoning: "still present" },
      ],
    })
    const result = parseVerifyResponse(raw)
    expect(result).toEqual([
      { id: "i-1", status: "fixed", reasoning: "code was changed" },
      { id: "i-2", status: "open", reasoning: "still present" },
    ])
  })

  it("defaults unknown status values to open", () => {
    const raw = JSON.stringify({
      verify: [{ id: "i-1", status: "maybe", reasoning: "unclear" }],
    })
    const result = parseVerifyResponse(raw)
    expect(result[0].status).toBe("open")
  })

  it("filters out entries with empty ids", () => {
    const raw = JSON.stringify({
      verify: [
        { id: "", status: "fixed", reasoning: "no id" },
        { id: "i-1", status: "fixed", reasoning: "good" },
      ],
    })
    const result = parseVerifyResponse(raw)
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe("i-1")
  })

  it("returns empty array for invalid JSON", () => {
    expect(parseVerifyResponse("not json")).toEqual([])
  })

  it("returns empty array for missing verify key", () => {
    expect(parseVerifyResponse(JSON.stringify({ triage: [] }))).toEqual([])
  })

  it("extracts JSON embedded in text", () => {
    const raw = `Here is my analysis:\n\n${JSON.stringify({
      verify: [{ id: "i-1", status: "fixed", reasoning: "resolved" }],
    })}\n\nDone.`
    const result = parseVerifyResponse(raw)
    expect(result).toHaveLength(1)
    expect(result[0].status).toBe("fixed")
  })
})

// ── buildVerifyPrompt ──

describe("verify · buildVerifyPrompt", () => {
  it("includes issue details and current code", () => {
    const prompt = buildVerifyPrompt([
      {
        id: "i-1",
        title: "Null deref",
        description: "calling .trim() on undefined",
        file: "src/foo.ts",
        line: 42,
        severity: "high",
        category: "bug",
        currentCode: "  42 │ const x = val.trim()",
      },
    ])
    expect(prompt).toContain("i-1")
    expect(prompt).toContain("Null deref")
    expect(prompt).toContain("calling .trim() on undefined")
    expect(prompt).toContain("src/foo.ts:42")
    expect(prompt).toContain("val.trim()")
    expect(prompt).toContain("1 total")
  })

  it("handles issues with no file", () => {
    const prompt = buildVerifyPrompt([
      {
        id: "i-2",
        title: "Missing test",
        description: "no tests for module X",
        severity: "low",
        category: "style",
        currentCode: null,
      },
    ])
    expect(prompt).toContain("No file reference")
    expect(prompt).toContain("assume issue is still open")
  })

  it("handles issues where file was not found", () => {
    const prompt = buildVerifyPrompt([
      {
        id: "i-3",
        title: "Dead code",
        description: "unused function",
        file: "src/deleted.ts",
        severity: "low",
        category: "style",
        currentCode: null,
      },
    ])
    expect(prompt).toContain("file not found")
  })
})

// ── readFileContext ──

describe("verify · readFileContext", () => {
  let tmpDir = ""

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "crev-verify-"))
  })
  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it("returns null for non-existent files", () => {
    expect(readFileContext(path.join(tmpDir, "nope.ts"))).toBeNull()
  })

  it("reads file content without a line number", () => {
    const file = path.join(tmpDir, "test.ts")
    fs.writeFileSync(file, "line 1\nline 2\nline 3\n")
    const result = readFileContext(file)
    expect(result).toContain("line 1")
    expect(result).toContain("line 3")
  })

  it("reads context around a specific line", () => {
    const lines = Array.from({ length: 100 }, (_, i) => `line ${i + 1}`)
    const file = path.join(tmpDir, "big.ts")
    fs.writeFileSync(file, lines.join("\n"))
    const result = readFileContext(file, 50)
    expect(result).toContain("→  50 │ line 50")
    expect(result).toContain("  49 │ line 49")
    expect(result).toContain("  51 │ line 51")
  })
})

// ── applyVerifyStatuses ──

describe("verify · applyVerifyStatuses", () => {
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

  it("updates status for matched issues", () => {
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
    const statuses: VerifyStatus[] = [
      { id: "i-1", status: "fixed", reasoning: "resolved" },
      { id: "i-2", status: "open", reasoning: "still there" },
    ]

    applyVerifyStatuses(result, statuses)

    expect(result.reviews[0].issues[0].status).toBe("fixed")
    expect(result.reviews[0].issues[1].status).toBe("open")
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
    applyVerifyStatuses(result, [])

    expect(result.reviews[0].issues[0].status).toBe("open")
  })
})

// ── runVerify · runtime config forwarding ──

describe("verify · runVerify runtime config", () => {
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

  beforeEach(() => {
    vi.resetAllMocks()
  })

  it("forwards runtimeConfig to the LLM call", async () => {
    const execute = vi.fn().mockResolvedValue({
      raw: JSON.stringify({ verify: [{ id: "i-1", status: "open", reasoning: "still there" }] }),
      durationMs: 10,
      exitCode: 0,
    })
    valetMocks.getRuntime.mockReturnValue({ execute })

    const issues: ReviewIssue[] = [
      {
        id: "i-1",
        reviewer: "E",
        runtime: "claude",
        model: "sonnet",
        severity: "high",
        category: "bug",
        title: "Bug",
        description: "desc",
        file: "nonexistent.ts",
      },
    ]

    await runVerify({
      result: makeResult(issues),
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
        extraArgs: ["--timeout", "30", "--max-turns", "1"],
      }),
    )
  })

  it("works without runtimeConfig (backward compatible)", async () => {
    const execute = vi.fn().mockResolvedValue({
      raw: JSON.stringify({ verify: [{ id: "i-1", status: "fixed", reasoning: "done" }] }),
      durationMs: 10,
      exitCode: 0,
    })
    valetMocks.getRuntime.mockReturnValue({ execute })

    const issues: ReviewIssue[] = [
      {
        id: "i-1",
        reviewer: "E",
        runtime: "claude",
        model: "sonnet",
        severity: "high",
        category: "bug",
        title: "Bug",
        description: "desc",
        file: "nonexistent.ts",
      },
    ]

    const result = await runVerify({
      result: makeResult(issues),
      runtime: "claude",
      model: "sonnet",
    })

    expect(result.summary.fixed).toBe(1)
    expect(execute.mock.calls[0][0].overrides).toEqual(
      expect.objectContaining({ extraArgs: ["--max-turns", "1"] }),
    )
  })
})
