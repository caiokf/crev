import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { Command } from "commander"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import * as detectToolsModule from "../util/detect-tools.js"
import * as skillsModule from "../util/skills.js"
import * as healthModule from "../core/health.js"
import { writeIfNew } from "../util/paths.js"
import { configTemplate } from "../templates/config.js"
import { registerInitCommand } from "./init.js"

async function runInit(args: string[]) {
  const program = new Command()
  registerInitCommand(program)
  await program.parseAsync(["init", ...args], { from: "user" })
}

describe("init scaffolding", () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "crev-init-"))
    vi.spyOn(console, "log").mockImplementation(() => {})
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true })
    vi.restoreAllMocks()
  })

  it("creates .crev directory structure with writeIfNew", () => {
    const crevDir = path.join(tmpDir, ".crev")
    fs.mkdirSync(path.join(crevDir, "schemas"), { recursive: true })

    writeIfNew(path.join(crevDir, "config.yaml"), configTemplate)

    expect(fs.existsSync(path.join(crevDir, "schemas"))).toBe(true)
    expect(fs.existsSync(path.join(crevDir, "config.yaml"))).toBe(true)
    expect(fs.readFileSync(path.join(crevDir, "config.yaml"), "utf-8")).toBe(configTemplate)
  })

  it("does not overwrite existing non-empty files via writeIfNew", () => {
    const crevDir = path.join(tmpDir, ".crev")
    fs.mkdirSync(crevDir, { recursive: true })

    const configPath = path.join(crevDir, "config.yaml")
    fs.writeFileSync(configPath, "custom: true", "utf-8")

    writeIfNew(configPath, configTemplate)

    expect(fs.readFileSync(configPath, "utf-8")).toBe("custom: true")
  })

  it("overwrites empty files via writeIfNew", () => {
    const crevDir = path.join(tmpDir, ".crev")
    fs.mkdirSync(crevDir, { recursive: true })

    const configPath = path.join(crevDir, "config.yaml")
    fs.writeFileSync(configPath, "  \n  ", "utf-8")

    writeIfNew(configPath, configTemplate)

    expect(fs.readFileSync(configPath, "utf-8")).toBe(configTemplate)
  })
})

describe("detectAITools", () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "crev-detect-"))
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true })
  })

  it("detects claude when .claude directory exists", () => {
    fs.mkdirSync(path.join(tmpDir, ".claude"), { recursive: true })
    const tools = detectToolsModule.detectAITools(tmpDir)
    const claude = tools.find((t) => t.id === "claude")
    expect(claude).toBeDefined()
    expect(claude!.detected).toBe(true)
  })

  it("returns all tool definitions even if not detected", () => {
    const tools = detectToolsModule.detectAITools(tmpDir)
    expect(tools.length).toBeGreaterThanOrEqual(5)
    expect(tools.every((t) => !t.detected)).toBe(true)
  })

  it("detects multiple tools simultaneously", () => {
    fs.mkdirSync(path.join(tmpDir, ".claude"), { recursive: true })
    fs.mkdirSync(path.join(tmpDir, ".cursor"), { recursive: true })
    fs.mkdirSync(path.join(tmpDir, ".github"), { recursive: true })

    const tools = detectToolsModule.detectAITools(tmpDir)
    const detected = tools.filter((t) => t.detected)
    expect(detected.length).toBe(3)
    expect(detected.map((t) => t.id)).toContain("claude")
    expect(detected.map((t) => t.id)).toContain("cursor")
    expect(detected.map((t) => t.id)).toContain("copilot")
  })
})

describe("registerInitCommand", () => {
  beforeEach(() => {
    vi.spyOn(console, "log").mockImplementation(() => {})
    vi.spyOn(detectToolsModule, "detectAITools").mockReturnValue([])
    vi.spyOn(skillsModule, "writeSkill").mockImplementation(() => {})
    vi.spyOn(healthModule, "collectRuntimeHealth").mockResolvedValue([])
    vi.spyOn(healthModule, "checkSchemaReadiness").mockReturnValue([])
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("scaffolds selected schemas in non-interactive mode", async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "crev-init-cmd-"))

    await runInit([tmp, "--tools", "none", "--schemas", "quick"])

    expect(fs.existsSync(path.join(tmp, ".crev", "config.yaml"))).toBe(true)
    expect(fs.existsSync(path.join(tmp, ".crev", "schemas", "quick.yaml"))).toBe(true)
    expect(fs.existsSync(path.join(tmp, ".crev", "schemas", "standard.yaml"))).toBe(false)
    expect(skillsModule.writeSkill).not.toHaveBeenCalled()

    fs.rmSync(tmp, { recursive: true, force: true })
  })

  it("writes skills for all configured tools when --tools all is used", async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "crev-init-tools-"))
    const claude = { name: "Claude", id: "claude", detected: true, detectionPath: ".claude", skillPath: ".claude/skills/crev" }
    const cursor = { name: "Cursor", id: "cursor", detected: false, detectionPath: ".cursor", skillPath: ".cursor/skills/crev" }
    vi.spyOn(detectToolsModule, "detectAITools").mockReturnValue([claude, cursor])

    await runInit([tmp, "--tools", "all", "--schemas", "quick"])

    expect(skillsModule.writeSkill).toHaveBeenCalledTimes(2)
    expect(skillsModule.writeSkill).toHaveBeenCalledWith(tmp, claude)
    expect(skillsModule.writeSkill).toHaveBeenCalledWith(tmp, cursor)

    fs.rmSync(tmp, { recursive: true, force: true })
  })
})
