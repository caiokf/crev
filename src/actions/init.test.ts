import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { describe, expect, vi } from "vitest"
import { it } from "@effect/vitest"
import { Effect } from "effect"

const healthMocks = vi.hoisted(() => ({
  collectRuntimeHealth: vi.fn(),
  checkSchemaReadiness: vi.fn(),
}))

vi.mock("../core/health.js", () => ({
  collectRuntimeHealth: healthMocks.collectRuntimeHealth,
  checkSchemaReadiness: healthMocks.checkSchemaReadiness,
}))

import { initAction } from "./init.js"
import type { AITool } from "../util/detect-tools.js"

function mkTmp(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "crev-init-action-"))
}

describe("initAction", () => {
  it.effect("scaffolds config + selected schemas into a fresh project", () => {
    healthMocks.collectRuntimeHealth.mockReset()
    healthMocks.checkSchemaReadiness.mockReset()
    healthMocks.collectRuntimeHealth.mockResolvedValue([])
    healthMocks.checkSchemaReadiness.mockReturnValue([])

    const root = mkTmp()

    return Effect.gen(function* () {
      const output = yield* initAction({
        projectRoot: root,
        tools: [],
        schemaNames: ["quick"],
      })

      expect(output.crevDir).toBe(path.join(root, ".crev"))
      expect(fs.existsSync(path.join(root, ".crev", "config.yaml"))).toBe(true)
      expect(fs.existsSync(path.join(root, ".crev", "schemas", "quick.yaml"))).toBe(true)
      expect(fs.existsSync(path.join(root, ".crev", "schemas", "standard.yaml"))).toBe(false)
      expect(output.healthError).toBeUndefined()
    }).pipe(
      Effect.ensuring(Effect.sync(() => fs.rmSync(root, { recursive: true, force: true }))),
    )
  })

  it.effect("silently skips unknown schema names", () => {
    healthMocks.collectRuntimeHealth.mockReset()
    healthMocks.checkSchemaReadiness.mockReset()
    healthMocks.collectRuntimeHealth.mockResolvedValue([])
    healthMocks.checkSchemaReadiness.mockReturnValue([])

    const root = mkTmp()

    return Effect.gen(function* () {
      yield* initAction({
        projectRoot: root,
        tools: [],
        schemaNames: ["quick", "does-not-exist"],
      })

      expect(fs.existsSync(path.join(root, ".crev", "schemas", "quick.yaml"))).toBe(true)
      expect(fs.existsSync(path.join(root, ".crev", "schemas", "does-not-exist.yaml"))).toBe(false)
    }).pipe(
      Effect.ensuring(Effect.sync(() => fs.rmSync(root, { recursive: true, force: true }))),
    )
  })

  it.effect("surfaces a non-fatal healthError when the health check throws", () => {
    healthMocks.collectRuntimeHealth.mockReset()
    healthMocks.checkSchemaReadiness.mockReset()
    healthMocks.collectRuntimeHealth.mockRejectedValue(new Error("boom"))

    const root = mkTmp()

    return Effect.gen(function* () {
      const output = yield* initAction({
        projectRoot: root,
        tools: [],
        schemaNames: [],
      })

      expect(output.healthError).toBe("boom")
      expect(output.runtimeHealth).toEqual([])
      expect(output.schemaReadiness).toEqual([])
      expect(healthMocks.checkSchemaReadiness).not.toHaveBeenCalled()
    }).pipe(
      Effect.ensuring(Effect.sync(() => fs.rmSync(root, { recursive: true, force: true }))),
    )
  })

  it.effect("writes skills for each provided tool", () => {
    healthMocks.collectRuntimeHealth.mockReset()
    healthMocks.checkSchemaReadiness.mockReset()
    healthMocks.collectRuntimeHealth.mockResolvedValue([])
    healthMocks.checkSchemaReadiness.mockReturnValue([])

    const root = mkTmp()
    const claude: AITool = {
      name: "Claude",
      id: "claude",
      detected: true,
      detectionPath: ".claude",
      skillPath: ".claude/skills/crev",
    }

    return Effect.gen(function* () {
      yield* initAction({ projectRoot: root, tools: [claude], schemaNames: [] })
      // writeSkill creates a SKILL.md file under the tool's skillPath.
      const claudeSkill = path.join(root, ".claude", "skills", "crev", "SKILL.md")
      expect(fs.existsSync(claudeSkill)).toBe(true)
    }).pipe(
      Effect.ensuring(Effect.sync(() => fs.rmSync(root, { recursive: true, force: true }))),
    )
  })
})
