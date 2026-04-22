import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { Command } from "commander"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const toolMocks = vi.hoisted(() => ({
  detectAITools: vi.fn(),
}))

const skillMocks = vi.hoisted(() => ({
  writeSkill: vi.fn(),
}))

const healthMocks = vi.hoisted(() => ({
  collectRuntimeHealth: vi.fn(),
  checkSchemaReadiness: vi.fn(),
}))

vi.mock("../util/detect-tools.js", () => ({
  detectAITools: toolMocks.detectAITools,
}))

vi.mock("../util/skills.js", () => ({
  writeSkill: skillMocks.writeSkill,
}))

vi.mock("../core/health.js", () => ({
  collectRuntimeHealth: healthMocks.collectRuntimeHealth,
  checkSchemaReadiness: healthMocks.checkSchemaReadiness,
}))

import { registerInitCommand } from "./init.js"

async function runInit(args: string[]) {
  const program = new Command()
  registerInitCommand(program)
  await program.parseAsync(["init", ...args], { from: "user" })
}

describe("registerInitCommand", () => {
  beforeEach(() => {
    toolMocks.detectAITools.mockReset()
    skillMocks.writeSkill.mockReset()
    healthMocks.collectRuntimeHealth.mockReset()
    healthMocks.checkSchemaReadiness.mockReset()
    healthMocks.collectRuntimeHealth.mockResolvedValue([])
    healthMocks.checkSchemaReadiness.mockReturnValue([])
    vi.spyOn(console, "log").mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("scaffolds selected schemas in non-interactive mode", async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "crev-init-cmd-"))
    toolMocks.detectAITools.mockReturnValue([])

    await runInit([tmp, "--tools", "none", "--schemas", "quick"])

    expect(fs.existsSync(path.join(tmp, ".crev", "config.yaml"))).toBe(true)
    expect(fs.existsSync(path.join(tmp, ".crev", "schemas", "quick.yaml"))).toBe(true)
    expect(fs.existsSync(path.join(tmp, ".crev", "schemas", "standard.yaml"))).toBe(false)
    expect(skillMocks.writeSkill).not.toHaveBeenCalled()

    fs.rmSync(tmp, { recursive: true, force: true })
  })

  it("writes skills for all configured tools when --tools all is used", async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "crev-init-tools-"))
    const claude = { name: "Claude", id: "claude", detected: true, detectionPath: ".claude", skillPath: ".claude/skills/crev" }
    const cursor = { name: "Cursor", id: "cursor", detected: false, detectionPath: ".cursor", skillPath: ".cursor/skills/crev" }
    toolMocks.detectAITools.mockReturnValue([claude, cursor])

    await runInit([tmp, "--tools", "all", "--schemas", "quick"])

    expect(skillMocks.writeSkill).toHaveBeenCalledTimes(2)
    expect(skillMocks.writeSkill).toHaveBeenCalledWith(tmp, claude)
    expect(skillMocks.writeSkill).toHaveBeenCalledWith(tmp, cursor)

    fs.rmSync(tmp, { recursive: true, force: true })
  })
})
