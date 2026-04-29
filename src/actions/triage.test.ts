import { Effect, Exit, Layer } from "effect"
import { afterEach, describe, expect, it, vi } from "vitest"
import { triageAction } from "./triage.js"
import { makeTestReviewStore } from "../services/ReviewStore.js"
import { makeTestSchemaStore, SchemaStore } from "../services/SchemaStore.js"
import { makeTestCrevConfig } from "../services/CrevConfig.js"
import type { ReviewIssue, ReviewResult } from "../core/types.js"

// ── Mocks ──

const triageMocks = vi.hoisted(() => ({
  runTriage: vi.fn(),
}))

const diffMocks = vi.hoisted(() => ({
  resolveDiff: vi.fn(),
  cleanupDiffFile: vi.fn(),
}))

const schemaMocks = vi.hoisted(() => ({
  resolveSchemaPath: vi.fn(),
}))

vi.mock("../core/triage.js", () => ({
  runTriage: triageMocks.runTriage,
}))

vi.mock("../core/diff.js", () => ({
  resolveDiff: diffMocks.resolveDiff,
  cleanupDiffFile: diffMocks.cleanupDiffFile,
}))

vi.mock("../core/schema.js", async () => {
  const actual = await vi.importActual<typeof import("../core/schema.js")>("../core/schema.js")
  return {
    ...actual,
    resolveSchemaPath: schemaMocks.resolveSchemaPath,
  }
})

// ── Helpers ──

function makeIssue(overrides: Partial<ReviewIssue> = {}): ReviewIssue {
  return {
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
    ...overrides,
  }
}

function makeReview(issues: ReviewIssue[], meta: Partial<ReviewResult["metadata"]> = {}): ReviewResult {
  return {
    metadata: {
      slug: "add-feature",
      timestamp: "2026-04-23T12:34:56Z",
      schema: "quick",
      diffType: "all",
      diffBase: "main",
      ...meta,
    },
    reviews: [
      {
        reviewer: "Engineer",
        runtime: "claude",
        model: "sonnet",
        durationMs: 1200,
        exitCode: 0,
        rawLength: 100,
        issues,
      },
    ],
    summary: {
      totalIssues: issues.length,
      bySeverity: {},
      byCategory: {},
      byReviewer: {},
    },
  }
}

const baseCfg = {
  crevDir: "/repo/.crev",
  config: {
    triage: {
      enabled: false,
      runtime: "claude",
      model: "opus",
    },
  },
}

describe("triageAction", () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it("triages a specific review file", async () => {
    const issue = makeIssue({ id: "i-1" })
    const review = makeReview([issue])
    const { layer: storeLayer, files } = makeTestReviewStore({ "/repo/review.json": review })
    const { layer: schemaLayer } = makeTestSchemaStore({})
    const { layer: cfgLayer } = makeTestCrevConfig(baseCfg)
    schemaMocks.resolveSchemaPath.mockReturnValue(null)

    diffMocks.resolveDiff.mockResolvedValue({
      diffContent: "diff --git a/foo b/foo",
      diffFile: "/tmp/diff",
      type: "all",
    })

    triageMocks.runTriage.mockResolvedValue({
      triaged: [
        { ...issue, triage: { verdict: "actionable", reasoning: "Real bug" } },
      ],
      durationMs: 500,
      summary: { actionable: 1, deferred: 0, dismissed: 0 },
    })

    const exit = await Effect.runPromiseExit(
      triageAction({ filePath: "/repo/review.json" }).pipe(
        Effect.provide(Layer.mergeAll(storeLayer, schemaLayer, cfgLayer)),
      ),
    )

    expect(Exit.isSuccess(exit)).toBe(true)
    if (!Exit.isSuccess(exit)) return

    expect(exit.value.summary).toEqual({ actionable: 1, deferred: 0, dismissed: 0 })
    const saved = files.get("/repo/review.json")!
    expect(saved.reviews[0]!.issues[0]!.triage?.verdict).toBe("actionable")
    expect(saved.summary.triage).toEqual({ actionable: 1, deferred: 0, dismissed: 0 })
  })

  it("uses latest review when no filePath given", async () => {
    const issue = makeIssue({ id: "i-1" })
    const review = makeReview([issue])
    const { layer: storeLayer, files } = makeTestReviewStore({
      "/repo/.crev/reviews/latest.json": review,
    })
    const { layer: schemaLayer } = makeTestSchemaStore({})
    schemaMocks.resolveSchemaPath.mockReturnValue(null)
    const { layer: cfgLayer } = makeTestCrevConfig({
      crevDir: "/repo/.crev",
      config: {
        output: { dir: "/repo/.crev/reviews" },
        triage: { runtime: "claude", model: "opus" },
      },
    })

    diffMocks.resolveDiff.mockResolvedValue({
      diffContent: "",
      diffFile: "/tmp/diff",
      type: "all",
    })

    triageMocks.runTriage.mockResolvedValue({
      triaged: [{ ...issue, triage: { verdict: "dismissed", reasoning: "Noise" } }],
      durationMs: 300,
      summary: { actionable: 0, deferred: 0, dismissed: 1 },
    })

    const exit = await Effect.runPromiseExit(
      triageAction({}).pipe(
        Effect.provide(Layer.mergeAll(storeLayer, schemaLayer, cfgLayer)),
      ),
    )

    expect(Exit.isSuccess(exit)).toBe(true)
    expect(files.get("/repo/.crev/reviews/latest.json")!.reviews[0]!.issues[0]!.triage?.verdict).toBe("dismissed")
  })

  it("proceeds with empty diff when diff regeneration fails", async () => {
    const issue = makeIssue({ id: "i-1" })
    const review = makeReview([issue])
    const { layer: storeLayer } = makeTestReviewStore({ "/repo/review.json": review })
    const { layer: schemaLayer } = makeTestSchemaStore({})
    const { layer: cfgLayer } = makeTestCrevConfig(baseCfg)
    schemaMocks.resolveSchemaPath.mockReturnValue(null)

    diffMocks.resolveDiff.mockRejectedValue(new Error("branch deleted"))

    triageMocks.runTriage.mockResolvedValue({
      triaged: [{ ...issue, triage: { verdict: "deferred", reasoning: "No diff" } }],
      durationMs: 200,
      summary: { actionable: 0, deferred: 1, dismissed: 0 },
    })

    const exit = await Effect.runPromiseExit(
      triageAction({ filePath: "/repo/review.json" }).pipe(
        Effect.provide(Layer.mergeAll(storeLayer, schemaLayer, cfgLayer)),
      ),
    )

    expect(Exit.isSuccess(exit)).toBe(true)
    expect(triageMocks.runTriage).toHaveBeenCalledWith(
      expect.objectContaining({ diffContent: "" }),
    )
  })

  it("skips diff regeneration for analyze reviews", async () => {
    const issue = makeIssue({ id: "i-1" })
    const review = makeReview([issue], { diffType: "analyze" })
    const { layer: storeLayer } = makeTestReviewStore({ "/repo/review.json": review })
    const { layer: schemaLayer } = makeTestSchemaStore({})
    const { layer: cfgLayer } = makeTestCrevConfig(baseCfg)
    schemaMocks.resolveSchemaPath.mockReturnValue(null)

    triageMocks.runTriage.mockResolvedValue({
      triaged: [{ ...issue, triage: { verdict: "actionable", reasoning: "Valid" } }],
      durationMs: 400,
      summary: { actionable: 1, deferred: 0, dismissed: 0 },
    })

    await Effect.runPromise(
      triageAction({ filePath: "/repo/review.json" }).pipe(
        Effect.provide(Layer.mergeAll(storeLayer, schemaLayer, cfgLayer)),
      ),
    )

    expect(diffMocks.resolveDiff).not.toHaveBeenCalled()
    expect(triageMocks.runTriage).toHaveBeenCalledWith(
      expect.objectContaining({ diffType: "analyze" }),
    )
  })

  it("CLI model override takes precedence over schema and config", async () => {
    const issue = makeIssue({ id: "i-1" })
    const review = makeReview([issue])
    const { layer: storeLayer } = makeTestReviewStore({ "/repo/review.json": review })
    const { layer: schemaLayer } = makeTestSchemaStore({
      quick: {
        reviewers: [{ name: "Engineer", runtime: "claude", model: "sonnet" }],
        triage: { enabled: true, runtime: "codex", model: "gpt-5.3-codex" },
      },
    })
    const { layer: cfgLayer } = makeTestCrevConfig(baseCfg)
    schemaMocks.resolveSchemaPath.mockReturnValue("/repo/.crev/schemas/quick.yaml")

    diffMocks.resolveDiff.mockResolvedValue({
      diffContent: "",
      diffFile: "/tmp/diff",
      type: "all",
    })

    triageMocks.runTriage.mockResolvedValue({
      triaged: [],
      durationMs: 100,
      summary: { actionable: 0, deferred: 0, dismissed: 0 },
    })

    await Effect.runPromise(
      triageAction({ filePath: "/repo/review.json", runtime: "gemini", model: "gemini-2.5-pro" }).pipe(
        Effect.provide(Layer.mergeAll(storeLayer, schemaLayer, cfgLayer)),
      ),
    )

    expect(triageMocks.runTriage).toHaveBeenCalledWith(
      expect.objectContaining({
        config: expect.objectContaining({
          triage: expect.objectContaining({ runtime: "gemini", model: "gemini-2.5-pro" }),
        }),
      }),
    )
  })

  it("returns no error when triage succeeds", async () => {
    const issue = makeIssue({ id: "i-1" })
    const review = makeReview([issue])
    const { layer: storeLayer } = makeTestReviewStore({ "/repo/review.json": review })
    const { layer: schemaLayer } = makeTestSchemaStore({})
    const { layer: cfgLayer } = makeTestCrevConfig(baseCfg)
    schemaMocks.resolveSchemaPath.mockReturnValue(null)

    diffMocks.resolveDiff.mockResolvedValue({
      diffContent: "diff --git a/foo b/foo",
      diffFile: "/tmp/diff",
      type: "all",
    })

    triageMocks.runTriage.mockResolvedValue({
      triaged: [
        { ...issue, triage: { verdict: "actionable", reasoning: "Real bug" } },
      ],
      durationMs: 500,
      summary: { actionable: 1, deferred: 0, dismissed: 0 },
    })

    const exit = await Effect.runPromiseExit(
      triageAction({ filePath: "/repo/review.json" }).pipe(
        Effect.provide(Layer.mergeAll(storeLayer, schemaLayer, cfgLayer)),
      ),
    )

    expect(Exit.isSuccess(exit)).toBe(true)
    if (!Exit.isSuccess(exit)) return
    expect(exit.value.error).toBeUndefined()
  })

  it("returns error from triage result when present", async () => {
    const issue = makeIssue({ id: "i-1" })
    const review = makeReview([issue])
    const { layer: storeLayer } = makeTestReviewStore({ "/repo/review.json": review })
    const { layer: schemaLayer } = makeTestSchemaStore({})
    const { layer: cfgLayer } = makeTestCrevConfig(baseCfg)
    schemaMocks.resolveSchemaPath.mockReturnValue(null)

    diffMocks.resolveDiff.mockResolvedValue({
      diffContent: "",
      diffFile: "/tmp/diff",
      type: "all",
    })

    triageMocks.runTriage.mockResolvedValue({
      triaged: [issue],
      durationMs: 100,
      error: "claude/opus: parse failure",
      summary: { actionable: 0, deferred: 0, dismissed: 0 },
    })

    const exit = await Effect.runPromiseExit(
      triageAction({ filePath: "/repo/review.json" }).pipe(
        Effect.provide(Layer.mergeAll(storeLayer, schemaLayer, cfgLayer)),
      ),
    )

    expect(Exit.isSuccess(exit)).toBe(true)
    if (!Exit.isSuccess(exit)) return
    expect(exit.value.error).toBe("claude/opus: parse failure")
  })

  it("passes config.aliases to schemaStore.load", async () => {
    const issue = makeIssue({ id: "i-1" })
    const review = makeReview([issue])
    const { layer: storeLayer } = makeTestReviewStore({ "/repo/review.json": review })
    const { layer: cfgLayer } = makeTestCrevConfig({
      crevDir: "/repo/.crev",
      config: {
        aliases: { opus: "claude-opus-4-6" },
        triage: { runtime: "claude", model: "opus" },
      },
    })
    schemaMocks.resolveSchemaPath.mockReturnValue("/repo/.crev/schemas/quick.yaml")

    diffMocks.resolveDiff.mockResolvedValue({
      diffContent: "",
      diffFile: "/tmp/diff",
      type: "all",
    })

    triageMocks.runTriage.mockResolvedValue({
      triaged: [],
      durationMs: 100,
      summary: { actionable: 0, deferred: 0, dismissed: 0 },
    })

    // Create a custom SchemaStore that captures the aliases parameter
    let capturedAliases: Record<string, string> | undefined
    const loadFn = (_path: string, aliases?: Record<string, string>) => {
      capturedAliases = aliases
      return Effect.succeed({
        reviewers: [{ name: "Engineer", runtime: "claude" as const, model: "sonnet" }],
        triage: { enabled: true, runtime: "claude" as const, model: "opus" },
      })
    }
    const schemaLayer = Layer.succeed(
      SchemaStore,
      SchemaStore.of({
        listAll: () => Effect.succeed([]),
        resolvePath: () => Effect.succeed(null),
        resolveOrFail: () => Effect.succeed(""),
        load: loadFn as any,
      }),
    )

    await Effect.runPromiseExit(
      triageAction({ filePath: "/repo/review.json" }).pipe(
        Effect.provide(Layer.mergeAll(storeLayer, schemaLayer, cfgLayer)),
      ),
    )

    expect(capturedAliases).toEqual({ opus: "claude-opus-4-6" })
  })

  it("applies schema-level triage overrides when no CLI override", async () => {
    const issue = makeIssue({ id: "i-1" })
    const review = makeReview([issue])
    const { layer: storeLayer } = makeTestReviewStore({ "/repo/review.json": review })
    const { layer: schemaLayer } = makeTestSchemaStore({
      quick: {
        reviewers: [{ name: "Engineer", runtime: "claude", model: "sonnet" }],
        triage: { enabled: true, runtime: "codex", model: "gpt-5.3-codex", deduplicate: true },
      },
    })
    const { layer: cfgLayer } = makeTestCrevConfig(baseCfg)
    schemaMocks.resolveSchemaPath.mockReturnValue("/repo/.crev/schemas/quick.yaml")

    diffMocks.resolveDiff.mockResolvedValue({
      diffContent: "",
      diffFile: "/tmp/diff",
      type: "all",
    })

    triageMocks.runTriage.mockResolvedValue({
      triaged: [],
      durationMs: 100,
      summary: { actionable: 0, deferred: 0, dismissed: 0 },
    })

    await Effect.runPromise(
      triageAction({ filePath: "/repo/review.json" }).pipe(
        Effect.provide(Layer.mergeAll(storeLayer, schemaLayer, cfgLayer)),
      ),
    )

    expect(triageMocks.runTriage).toHaveBeenCalledWith(
      expect.objectContaining({
        config: expect.objectContaining({
          triage: expect.objectContaining({
            runtime: "codex",
            model: "gpt-5.3-codex",
            deduplicate: true,
          }),
        }),
      }),
    )
  })
})
