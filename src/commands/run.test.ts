import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { Command } from "commander"
import { Effect } from "effect"
import { getModelOverrideReviewerError, getReviewerFilterError } from "./run.js"
import { parseModelOverrides } from "../core/schema.js"

// ── Mocks for command-level integration tests ──

const actionMocks = vi.hoisted(() => ({
  runAction: vi.fn(),
}))

vi.mock("../actions/run.js", async (importOriginal) => {
  const { Effect: Eff } = await import("effect")
  const actual = await importOriginal<typeof import("../actions/run.js")>()
  return {
    ...actual,
    runAction: (input: unknown) =>
      Eff.suspend(() => {
        const result = actionMocks.runAction(input)
        if (result && typeof result === "object" && "_op" in result) {
          return result as ReturnType<typeof Eff.succeed>
        }
        return Eff.succeed(result)
      }),
  }
})

vi.mock("../core/config.js", () => ({
  findCrevDir: vi.fn(() => "/fake/.crev"),
  loadLayeredConfig: vi.fn(() => ({
    defaults: { schema: "quick", type: "all", base: "main" },
    runtimes: {},
    aliases: {},
    diff: { exclude: [] },
    output: { dir: ".crev/reviews", format: "json" },
    normalizer: { enabled: false, runtime: "claude", model: "haiku" },
    failback: {},
    triage: {
      enabled: false,
      runtime: "claude",
      model: "opus",
      deduplicate: false,
      recategorize: false,
      prompt: "",
    },
  })),
}))

import { registerRunCommand } from "./run.js"

// ── Fixtures ──

const fakeResult = {
  metadata: {
    slug: "main",
    timestamp: "2026-04-25T00:00:00.000Z",
    schema: "quick",
    diffType: "all",
  },
  reviews: [],
  summary: { totalIssues: 0, bySeverity: {}, byCategory: {}, byReviewer: {} },
}

const fakePromptsOutput = {
  metadata: fakeResult.metadata,
  prompts: [{ reviewer: "Engineer", runtime: "claude", model: "sonnet", prompt: "check it" }],
}

// ── Helpers ──

async function runRun(args: string[]) {
  const program = new Command().exitOverride()
  registerRunCommand(program)
  await program.parseAsync(["run", ...args], { from: "user" })
}

function mockExit() {
  return vi.spyOn(process, "exit").mockImplementation(((code?: number) => {
    throw new Error(`process.exit:${code ?? 0}`)
  }) as never)
}

// ── Existing unit tests ──

const schema = {
  reviewers: [
    { name: "Engineer", runtime: "claude", model: "sonnet", prompt: "check correctness" },
    { name: "Security", runtime: "claude", model: "opus", prompt: "check security" },
  ],
}

describe("getReviewerFilterError", () => {
  it("returns null when no filter is provided", () => {
    expect(getReviewerFilterError(schema, undefined)).toBeNull()
  })

  it("returns null when filter matches a reviewer (case-insensitive)", () => {
    expect(getReviewerFilterError(schema, ["security"])).toBeNull()
    expect(getReviewerFilterError(schema, [" Security "])).toBeNull()
  })

  it("returns null when filter includes all", () => {
    expect(getReviewerFilterError(schema, ["all"])).toBeNull()
  })

  it("returns helpful error when no reviewers match", () => {
    expect(getReviewerFilterError(schema, ["Nope"]))
      .toBe("No reviewers matched --reviewers. Available reviewers: Engineer, Security")
  })
})

describe("getModelOverrideReviewerError", () => {
  it("returns null when targeted is empty", () => {
    const overrides = parseModelOverrides([])
    expect(getModelOverrideReviewerError(schema, overrides)).toBeNull()
  })

  it("returns null when targeted names match exactly", () => {
    const overrides = parseModelOverrides(["Engineer=claude/opus"])
    expect(getModelOverrideReviewerError(schema, overrides)).toBeNull()
  })

  it("returns null when targeted names match case-insensitively", () => {
    const overrides = parseModelOverrides(["SECURITY=claude/opus"])
    expect(getModelOverrideReviewerError(schema, overrides)).toBeNull()
  })

  it("returns null for blanket-only overrides", () => {
    const overrides = parseModelOverrides(["claude/opus"])
    expect(getModelOverrideReviewerError(schema, overrides)).toBeNull()
  })

  it("returns error when targeted name doesn't match any reviewer", () => {
    const overrides = parseModelOverrides(["Nope=claude/opus"])
    const err = getModelOverrideReviewerError(schema, overrides)
    expect(err).toContain("unknown reviewer")
    expect(err).toContain("nope")
  })

  it("error message lists available reviewers", () => {
    const overrides = parseModelOverrides(["Nope=claude/opus"])
    const err = getModelOverrideReviewerError(schema, overrides)
    expect(err).toContain("Engineer")
    expect(err).toContain("Security")
  })
})

// ── Command-level integration tests ──

describe("registerRunCommand (action)", () => {
  let logSpy: ReturnType<typeof vi.spyOn>
  let errorSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    actionMocks.runAction.mockReset()
    actionMocks.runAction.mockReturnValue(
      Effect.succeed({ kind: "completed", result: fakeResult }),
    )
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {})
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // ── Flag normalization ──

  describe("flag normalization", () => {
    it("resolves --base to branch diff source", async () => {
      await runRun(["--schema", "quick", "--base", "main"])
      expect(actionMocks.runAction).toHaveBeenCalledWith(
        expect.objectContaining({
          command: expect.objectContaining({
            diff: { kind: "branch", base: "main", type: "all" },
          }),
        }),
      )
    })

    it("resolves --pr to pr diff source", async () => {
      await runRun(["--schema", "quick", "--pr", "42"])
      expect(actionMocks.runAction).toHaveBeenCalledWith(
        expect.objectContaining({
          command: expect.objectContaining({
            diff: { kind: "pr", pr: 42 },
          }),
        }),
      )
    })

    it("resolves --analyze to analyze:true with type:all diff", async () => {
      await runRun(["--schema", "quick", "--analyze"])
      expect(actionMocks.runAction).toHaveBeenCalledWith(
        expect.objectContaining({
          command: expect.objectContaining({
            analyze: true,
            diff: { kind: "local", type: "all" },
          }),
        }),
      )
    })

    it("parses --reviewers as comma-separated reviewer list", async () => {
      await runRun(["--schema", "quick", "--reviewers", "Engineer,Security"])
      expect(actionMocks.runAction).toHaveBeenCalledWith(
        expect.objectContaining({
          command: expect.objectContaining({
            reviewers: ["Engineer", "Security"],
          }),
        }),
      )
    })

    it("collects repeated --model flags into modelOverrides", async () => {
      await runRun(["--schema", "quick", "--model", "claude/opus", "--model", "Engineer=claude/sonnet"])
      expect(actionMocks.runAction).toHaveBeenCalledWith(
        expect.objectContaining({
          command: expect.objectContaining({
            modelOverrides: ["claude/opus", "Engineer=claude/sonnet"],
          }),
        }),
      )
    })
  })

  // ── Output mode selection ──

  describe("output mode selection", () => {
    it("--json sets output.kind to json", async () => {
      await runRun(["--schema", "quick", "--json"])
      expect(actionMocks.runAction).toHaveBeenCalledWith(
        expect.objectContaining({
          command: expect.objectContaining({
            output: { kind: "json" },
          }),
        }),
      )
    })

    it("--plain sets output.kind to plain", async () => {
      await runRun(["--schema", "quick", "--plain"])
      expect(actionMocks.runAction).toHaveBeenCalledWith(
        expect.objectContaining({
          command: expect.objectContaining({
            output: { kind: "plain" },
          }),
        }),
      )
    })

    it("--prompt-only sets output.kind to prompt-only", async () => {
      actionMocks.runAction.mockReturnValue(
        Effect.succeed({ kind: "prompt-only", prompts: fakePromptsOutput }),
      )
      await runRun(["--schema", "quick", "--prompt-only"])
      expect(actionMocks.runAction).toHaveBeenCalledWith(
        expect.objectContaining({
          command: expect.objectContaining({
            output: { kind: "prompt-only", format: "json" },
          }),
        }),
      )
    })

    it("no output flag defaults to tui", async () => {
      await runRun(["--schema", "quick"])
      expect(actionMocks.runAction).toHaveBeenCalledWith(
        expect.objectContaining({
          command: expect.objectContaining({
            output: { kind: "tui" },
          }),
        }),
      )
    })
  })

  // ── Result output branches ──

  describe("result output", () => {
    it("completed + --json prints review JSON to stdout", async () => {
      actionMocks.runAction.mockReturnValue(
        Effect.succeed({ kind: "completed", result: fakeResult }),
      )
      await runRun(["--schema", "quick", "--json"])
      const printed = JSON.parse(logSpy.mock.calls[0][0] as string)
      expect(printed.metadata.slug).toBe("main")
    })

    it("completed without --json prints nothing (TUI owns output)", async () => {
      actionMocks.runAction.mockReturnValue(
        Effect.succeed({ kind: "completed", result: fakeResult }),
      )
      await runRun(["--schema", "quick", "--plain"])
      expect(logSpy).not.toHaveBeenCalled()
    })

    it("empty + --json prints empty result as JSON", async () => {
      actionMocks.runAction.mockReturnValue(
        Effect.succeed({ kind: "empty", result: fakeResult }),
      )
      await runRun(["--schema", "quick", "--json"])
      const printed = JSON.parse(logSpy.mock.calls[0][0] as string)
      expect(printed.summary.totalIssues).toBe(0)
    })

    it("empty without --json prints no-diff message", async () => {
      actionMocks.runAction.mockReturnValue(
        Effect.succeed({ kind: "empty", result: fakeResult }),
      )
      await runRun(["--schema", "quick", "--plain"])
      expect(logSpy.mock.calls[0][0]).toContain("No diff content found")
    })

    it("prompt-only prints prompts as JSON", async () => {
      actionMocks.runAction.mockReturnValue(
        Effect.succeed({ kind: "prompt-only", prompts: fakePromptsOutput }),
      )
      await runRun(["--schema", "quick", "--prompt-only"])
      const printed = JSON.parse(logSpy.mock.calls[0][0] as string)
      expect(printed.prompts).toHaveLength(1)
      expect(printed.prompts[0].reviewer).toBe("Engineer")
    })
  })

  // ── Error mapping ──

  describe("error mapping", () => {
    it("RunCancelledError logs yellow message without calling process.exit", async () => {
      const { RunCancelledError } = await import("../errors.js")
      actionMocks.runAction.mockReturnValue(
        Effect.fail(new RunCancelledError({ message: "cancelled" })),
      )
      await runRun(["--schema", "quick"])
      expect(logSpy.mock.calls[0][0]).toContain("Review cancelled")
    })

    it("RunValidationError exits with validation reason", async () => {
      const exitSpy = mockExit()
      const { RunValidationError } = await import("../errors.js")
      actionMocks.runAction.mockReturnValue(
        Effect.fail(new RunValidationError({ reason: "bad flag combo" })),
      )
      await expect(runRun(["--schema", "quick"])).rejects.toThrow("process.exit:1")
      expect(errorSpy.mock.calls[0][0]).toContain("bad flag combo")
      expect(exitSpy).toHaveBeenCalledWith(1)
    })

    it("SchemaNotFoundError exits with schema name in message", async () => {
      const exitSpy = mockExit()
      const { SchemaNotFoundError } = await import("../errors.js")
      actionMocks.runAction.mockReturnValue(
        Effect.fail(new SchemaNotFoundError({ name: "missing-schema", searched: [] })),
      )
      await expect(runRun(["--schema", "missing-schema"])).rejects.toThrow("process.exit:1")
      expect(errorSpy.mock.calls[0][0]).toContain("missing-schema")
      expect(exitSpy).toHaveBeenCalledWith(1)
    })

    it("DiffResolutionError exits with diff failure message", async () => {
      const exitSpy = mockExit()
      const { DiffResolutionError } = await import("../errors.js")
      actionMocks.runAction.mockReturnValue(
        Effect.fail(new DiffResolutionError({ reason: "git not found", cause: null })),
      )
      await expect(runRun(["--schema", "quick"])).rejects.toThrow("process.exit:1")
      expect(errorSpy.mock.calls[0][0]).toContain("git not found")
      expect(exitSpy).toHaveBeenCalledWith(1)
    })

    it("OrchestrationError exits with orchestration failure message", async () => {
      const exitSpy = mockExit()
      const { OrchestrationError } = await import("../errors.js")
      actionMocks.runAction.mockReturnValue(
        Effect.fail(new OrchestrationError({ reason: "LLM timed out", cause: null })),
      )
      await expect(runRun(["--schema", "quick"])).rejects.toThrow("process.exit:1")
      expect(errorSpy.mock.calls[0][0]).toContain("LLM timed out")
      expect(exitSpy).toHaveBeenCalledWith(1)
    })
  })
})
