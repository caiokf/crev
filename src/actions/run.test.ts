import { describe, expect, vi } from "vitest"
import { it } from "@effect/vitest"
import { Effect, Exit } from "effect"

const orchestratorMocks = vi.hoisted(() => ({
  orchestrate: vi.fn(),
  buildPromptOnlyResult: vi.fn(),
}))

const diffMocks = vi.hoisted(() => ({
  resolveDiff: vi.fn(),
  cleanupDiffFile: vi.fn(),
}))

const schemaMocks = vi.hoisted(() => ({
  resolveSchemaPath: vi.fn(),
  loadSchemaFile: vi.fn(),
}))

const autoSelectMocks = vi.hoisted(() => ({
  autoSelectSchema: vi.fn(),
}))

const fsMocks = vi.hoisted(() => ({
  readFileSync: vi.fn(),
}))

vi.mock("../core/orchestrator.js", async () => {
  const actual = await vi.importActual<typeof import("../core/orchestrator.js")>(
    "../core/orchestrator.js",
  )
  return {
    ...actual,
    orchestrate: orchestratorMocks.orchestrate,
    buildPromptOnlyResult: orchestratorMocks.buildPromptOnlyResult,
  }
})

vi.mock("../core/diff.js", () => ({
  resolveDiff: diffMocks.resolveDiff,
  cleanupDiffFile: diffMocks.cleanupDiffFile,
}))

vi.mock("../core/schema.js", async () => {
  const actual = await vi.importActual<typeof import("../core/schema.js")>("../core/schema.js")
  return {
    ...actual,
    resolveSchemaPath: schemaMocks.resolveSchemaPath,
    loadSchemaFile: schemaMocks.loadSchemaFile,
  }
})

vi.mock("../core/schema-auto-select.js", () => ({
  autoSelectSchema: autoSelectMocks.autoSelectSchema,
}))

vi.mock("node:fs", async () => {
  const actual = await vi.importActual<typeof import("node:fs")>("node:fs")
  return { ...actual, default: { ...actual, readFileSync: fsMocks.readFileSync }, readFileSync: fsMocks.readFileSync }
})

import { runAction } from "./run.js"
import { makeTestCrevConfig } from "../services/CrevConfig.js"
import { UserCancelledError as InternalUserCancelledError } from "../core/types.js"
import type { RunCommand } from "../core/types.js"

const baseCommand: RunCommand = {
  schema: "quick",
  diff: { kind: "local", type: "all" },
  output: { kind: "plain" },
  target: { kind: "fresh" },
  plain: true,
  analyze: false,
}

const testSchema = {
  reviewers: [
    { name: "Engineer", runtime: "claude", model: "sonnet", prompt: "check" },
  ],
}

function seedSchemaMocks() {
  schemaMocks.resolveSchemaPath.mockReturnValue("/repo/.crev/schemas/quick.yaml")
  fsMocks.readFileSync.mockReturnValue("description: quick")
  schemaMocks.loadSchemaFile.mockReturnValue(testSchema)
}

describe("runAction", () => {
  it.effect("returns empty result when diff has no content", () => {
    orchestratorMocks.orchestrate.mockReset()
    diffMocks.resolveDiff.mockReset()
    diffMocks.cleanupDiffFile.mockReset()
    schemaMocks.resolveSchemaPath.mockReset()
    schemaMocks.loadSchemaFile.mockReset()
    fsMocks.readFileSync.mockReset()

    seedSchemaMocks()
    diffMocks.resolveDiff.mockResolvedValue({ diffContent: "   ", diffFile: "/tmp/a.diff", type: "all" })

    const { layer } = makeTestCrevConfig({ crevDir: "/repo/.crev", config: {} })

    return Effect.gen(function* () {
      const out = yield* runAction({ command: baseCommand })
      expect(out.kind).toBe("empty")
      if (out.kind === "empty") {
        expect(out.result.reviews).toEqual([])
        expect(out.result.metadata.schema).toBe("quick")
      }
      expect(orchestratorMocks.orchestrate).not.toHaveBeenCalled()
      expect(diffMocks.cleanupDiffFile).toHaveBeenCalled()
    }).pipe(Effect.provide(layer))
  })

  it.effect("resolves auto-select before loading the schema", () => {
    orchestratorMocks.orchestrate.mockReset()
    diffMocks.resolveDiff.mockReset()
    schemaMocks.resolveSchemaPath.mockReset()
    schemaMocks.loadSchemaFile.mockReset()
    fsMocks.readFileSync.mockReset()
    autoSelectMocks.autoSelectSchema.mockReset()

    autoSelectMocks.autoSelectSchema.mockResolvedValue({
      schema: "standard",
      reasoning: "many files changed",
    })
    seedSchemaMocks()
    diffMocks.resolveDiff.mockResolvedValue({ diffContent: "", diffFile: "/tmp/a.diff", type: "all" })

    const { layer } = makeTestCrevConfig({ crevDir: "/repo/.crev", config: {} })

    return Effect.gen(function* () {
      const out = yield* runAction({
        command: { ...baseCommand, schema: "auto" },
      })
      expect(out.autoSelected?.schema).toBe("standard")
      expect(out.autoSelected?.reasoning).toBe("many files changed")
      expect(schemaMocks.resolveSchemaPath).toHaveBeenCalledWith("standard", "/repo/.crev")
    }).pipe(Effect.provide(layer))
  })

  it.effect("fails with SchemaNotFoundError when the schema path cannot be resolved", () => {
    schemaMocks.resolveSchemaPath.mockReset()
    schemaMocks.resolveSchemaPath.mockReturnValue(null)

    const { layer } = makeTestCrevConfig({ crevDir: "/repo/.crev", config: {} })

    return Effect.gen(function* () {
      const exit = yield* Effect.exit(runAction({ command: baseCommand }))
      expect(Exit.isFailure(exit)).toBe(true)
      if (Exit.isFailure(exit)) {
        const err = exit.cause._tag === "Fail" ? exit.cause.error : null
        expect(err?._tag).toBe("SchemaNotFoundError")
      }
    }).pipe(Effect.provide(layer))
  })

  it.effect("builds a prompt-only result when output.kind is prompt-only", () => {
    orchestratorMocks.orchestrate.mockReset()
    orchestratorMocks.buildPromptOnlyResult.mockReset()
    diffMocks.resolveDiff.mockReset()
    schemaMocks.resolveSchemaPath.mockReset()
    schemaMocks.loadSchemaFile.mockReset()
    fsMocks.readFileSync.mockReset()

    seedSchemaMocks()
    diffMocks.resolveDiff.mockResolvedValue({ diffContent: "diff --git a/x b/x", diffFile: "/tmp/a.diff", type: "all" })
    orchestratorMocks.buildPromptOnlyResult.mockReturnValue({
      metadata: { slug: "x", timestamp: "t", schema: "quick", diffType: "all" },
      prompts: [{ reviewer: "Engineer", runtime: "claude", model: "sonnet", prompt: "..." }],
    })

    const { layer } = makeTestCrevConfig({ crevDir: "/repo/.crev", config: {} })

    return Effect.gen(function* () {
      const out = yield* runAction({
        command: { ...baseCommand, output: { kind: "prompt-only", format: "json" } },
      })
      expect(out.kind).toBe("prompt-only")
      expect(orchestratorMocks.orchestrate).not.toHaveBeenCalled()
    }).pipe(Effect.provide(layer))
  })

  it.effect("maps orchestrator UserCancelledError to tagged RunCancelledError", () => {
    orchestratorMocks.orchestrate.mockReset()
    diffMocks.resolveDiff.mockReset()
    schemaMocks.resolveSchemaPath.mockReset()
    schemaMocks.loadSchemaFile.mockReset()
    fsMocks.readFileSync.mockReset()

    seedSchemaMocks()
    diffMocks.resolveDiff.mockResolvedValue({ diffContent: "diff --git a/x b/x", diffFile: "/tmp/a.diff", type: "all" })
    orchestratorMocks.orchestrate.mockRejectedValue(new InternalUserCancelledError())

    const { layer } = makeTestCrevConfig({ crevDir: "/repo/.crev", config: {} })

    return Effect.gen(function* () {
      const exit = yield* Effect.exit(runAction({ command: baseCommand }))
      expect(Exit.isFailure(exit)).toBe(true)
      if (Exit.isFailure(exit)) {
        const err = exit.cause._tag === "Fail" ? exit.cause.error : null
        expect(err?._tag).toBe("RunCancelledError")
      }
    }).pipe(Effect.provide(layer))
  })

  it.effect("rejects a reviewer filter that matches no reviewers", () => {
    diffMocks.resolveDiff.mockReset()
    schemaMocks.resolveSchemaPath.mockReset()
    schemaMocks.loadSchemaFile.mockReset()
    fsMocks.readFileSync.mockReset()

    seedSchemaMocks()

    const { layer } = makeTestCrevConfig({ crevDir: "/repo/.crev", config: {} })

    return Effect.gen(function* () {
      const exit = yield* Effect.exit(
        runAction({ command: { ...baseCommand, reviewers: ["Nope"] } }),
      )
      expect(Exit.isFailure(exit)).toBe(true)
      if (Exit.isFailure(exit)) {
        const err = exit.cause._tag === "Fail" ? exit.cause.error : null
        expect(err?._tag).toBe("RunValidationError")
      }
    }).pipe(Effect.provide(layer))
  })
})
