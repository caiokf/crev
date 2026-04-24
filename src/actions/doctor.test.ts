import { describe, expect, vi } from "vitest"
import { it } from "@effect/vitest"
import { Effect, Layer } from "effect"

const valetMocks = vi.hoisted(() => ({
  // Default empty — module-level code in core/schema.ts evaluates this at import time.
  getAllRuntimes: vi.fn(() => [] as unknown[]),
}))

const healthMocks = vi.hoisted(() => ({
  checkSchemaReadiness: vi.fn(),
  checkProjectSetup: vi.fn(),
}))

const skillMocks = vi.hoisted(() => ({
  getInstalledSkills: vi.fn(),
  isSkillUpToDate: vi.fn(),
}))

vi.mock("@caiokf/valet", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@caiokf/valet")>()
  return {
    ...actual,
    getAllRuntimes: valetMocks.getAllRuntimes,
  }
})

vi.mock("../core/health.js", () => ({
  checkSchemaReadiness: healthMocks.checkSchemaReadiness,
  checkProjectSetup: healthMocks.checkProjectSetup,
}))

vi.mock("../util/skills.js", () => ({
  getInstalledSkills: skillMocks.getInstalledSkills,
  isSkillUpToDate: skillMocks.isSkillUpToDate,
}))

import { doctorAction } from "./doctor.js"
import { makeTestCrevConfig } from "../services/CrevConfig.js"
import { makeTestSchemaStore } from "../services/SchemaStore.js"
import type { SchemaFileType } from "../core/schema.js"

const baseRuntime = (overrides: Partial<{ name: string; healthCheck: () => Promise<unknown> }> = {}) => ({
  name: overrides.name ?? "claude",
  healthCheck:
    overrides.healthCheck ??
    (() =>
      Promise.resolve({
        name: overrides.name ?? "claude",
        command: overrides.name ?? "claude",
        installed: true,
        version: "2.1.0",
        authenticated: "yes" as const,
        authDetail: "ok",
        error: null,
      })),
})

const crevDir = "/repo/.crev"
const { layer: cfgLayer } = makeTestCrevConfig({ crevDir, config: {} })

const seedSchema = (runtime = "claude"): SchemaFileType => ({
  description: "Quick",
  reviewers: [
    { name: "Engineer", runtime, model: "sonnet", prompt: "review" },
  ],
})

describe("doctorAction", () => {
  it.effect("gathers runtimes referenced by schemas, skipping unreferenced ones", () => {
    valetMocks.getAllRuntimes.mockReset()
    healthMocks.checkSchemaReadiness.mockReset()
    healthMocks.checkProjectSetup.mockReset()
    skillMocks.getInstalledSkills.mockReset()
    skillMocks.isSkillUpToDate.mockReset()

    valetMocks.getAllRuntimes.mockReturnValue([
      baseRuntime({ name: "claude" }),
      baseRuntime({ name: "codex" }),
    ])
    healthMocks.checkSchemaReadiness.mockReturnValue([
      { name: "quick", ready: true, issues: [] },
    ])
    healthMocks.checkProjectSetup.mockReturnValue([
      { name: ".crev/config.yaml", ok: true, detail: "valid" },
    ])
    skillMocks.getInstalledSkills.mockReturnValue([])
    skillMocks.isSkillUpToDate.mockReturnValue(true)

    const { layer: storeLayer } = makeTestSchemaStore({ quick: seedSchema("claude") })

    return Effect.gen(function* () {
      const snapshot = yield* doctorAction()
      expect(snapshot.crevDir).toBe(crevDir)
      expect(snapshot.runtimes.map((r) => r.name)).toEqual(["claude"])
      expect([...snapshot.runtimeUsage.entries()]).toEqual([["claude", ["quick"]]])
      expect(snapshot.schemaReadiness).toHaveLength(1)
      expect(snapshot.projectChecks[0].ok).toBe(true)
    }).pipe(Effect.provide(Layer.mergeAll(cfgLayer, storeLayer)))
  })

  it.effect("includes every runtime when includeAll is true", () => {
    valetMocks.getAllRuntimes.mockReset()
    healthMocks.checkSchemaReadiness.mockReset()
    healthMocks.checkProjectSetup.mockReset()
    skillMocks.getInstalledSkills.mockReset()

    valetMocks.getAllRuntimes.mockReturnValue([
      baseRuntime({ name: "claude" }),
      baseRuntime({ name: "codex" }),
    ])
    healthMocks.checkSchemaReadiness.mockReturnValue([])
    healthMocks.checkProjectSetup.mockReturnValue([])
    skillMocks.getInstalledSkills.mockReturnValue([])

    const { layer: storeLayer } = makeTestSchemaStore({})

    return Effect.gen(function* () {
      const snapshot = yield* doctorAction({ includeAll: true })
      expect(snapshot.runtimes.map((r) => r.name).sort()).toEqual(["claude", "codex"])
    }).pipe(Effect.provide(Layer.mergeAll(cfgLayer, storeLayer)))
  })

  it.effect("fires onRuntimeProgress for each runtime check", () => {
    valetMocks.getAllRuntimes.mockReset()
    healthMocks.checkSchemaReadiness.mockReset()
    healthMocks.checkProjectSetup.mockReset()
    skillMocks.getInstalledSkills.mockReset()

    valetMocks.getAllRuntimes.mockReturnValue([
      baseRuntime({ name: "claude" }),
      baseRuntime({ name: "codex" }),
    ])
    healthMocks.checkSchemaReadiness.mockReturnValue([])
    healthMocks.checkProjectSetup.mockReturnValue([])
    skillMocks.getInstalledSkills.mockReturnValue([])

    const { layer: storeLayer } = makeTestSchemaStore({})
    const progress: Array<[number, number]> = []

    return Effect.gen(function* () {
      yield* doctorAction({
        includeAll: true,
        onRuntimeProgress: (checked, total) => progress.push([checked, total]),
      })
      expect(progress).toHaveLength(2)
      expect(progress.map(([, total]) => total)).toEqual([2, 2])
      expect(progress.map(([checked]) => checked).sort()).toEqual([1, 2])
    }).pipe(Effect.provide(Layer.mergeAll(cfgLayer, storeLayer)))
  })

  it.effect("maps skill records to SkillCheck objects", () => {
    valetMocks.getAllRuntimes.mockReset()
    healthMocks.checkSchemaReadiness.mockReset()
    healthMocks.checkProjectSetup.mockReset()
    skillMocks.getInstalledSkills.mockReset()
    skillMocks.isSkillUpToDate.mockReset()

    valetMocks.getAllRuntimes.mockReturnValue([])
    healthMocks.checkSchemaReadiness.mockReturnValue([])
    healthMocks.checkProjectSetup.mockReturnValue([])
    skillMocks.getInstalledSkills.mockReturnValue([
      { name: "Claude Code", id: "claude", detected: true, detectionPath: ".claude", skillPath: ".claude/skills/crev" },
      { name: "Cursor", id: "cursor", detected: true, detectionPath: ".cursor", skillPath: ".cursor/skills/crev" },
    ])
    skillMocks.isSkillUpToDate.mockImplementation((_root: string, tool: { id: string }) => tool.id === "claude")

    const { layer: storeLayer } = makeTestSchemaStore({})

    return Effect.gen(function* () {
      const snapshot = yield* doctorAction()
      expect(snapshot.skills).toEqual([
        { tool: "Claude Code", id: "claude", upToDate: true },
        { tool: "Cursor", id: "cursor", upToDate: false },
      ])
    }).pipe(Effect.provide(Layer.mergeAll(cfgLayer, storeLayer)))
  })
})
