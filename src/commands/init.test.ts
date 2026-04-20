import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { detectAITools } from "../util/detect-tools.js"
import { writeIfNew } from "../util/paths.js"
import { configTemplate } from "../templates/config.js"

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
    const tools = detectAITools(tmpDir)
    const claude = tools.find((t) => t.id === "claude")
    expect(claude).toBeDefined()
    expect(claude!.detected).toBe(true)
  })

  it("returns all tool definitions even if not detected", () => {
    const tools = detectAITools(tmpDir)
    expect(tools.length).toBeGreaterThanOrEqual(5)
    expect(tools.every((t) => !t.detected)).toBe(true)
  })

  it("detects multiple tools simultaneously", () => {
    fs.mkdirSync(path.join(tmpDir, ".claude"), { recursive: true })
    fs.mkdirSync(path.join(tmpDir, ".cursor"), { recursive: true })
    fs.mkdirSync(path.join(tmpDir, ".github"), { recursive: true })

    const tools = detectAITools(tmpDir)
    const detected = tools.filter((t) => t.detected)
    expect(detected.length).toBe(3)
    expect(detected.map((t) => t.id)).toContain("claude")
    expect(detected.map((t) => t.id)).toContain("cursor")
    expect(detected.map((t) => t.id)).toContain("copilot")
  })
})
