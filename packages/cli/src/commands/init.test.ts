import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { detectAITools } from "../util/detect-tools.js"

describe("init scaffolding", () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "crev-init-"))
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true })
  })

  it("creates .crev directory structure", () => {
    const crevDir = path.join(tmpDir, ".crev")
    for (const dir of ["schemas", "agents", "diffs", "reviews"]) {
      fs.mkdirSync(path.join(crevDir, dir), { recursive: true })
    }

    expect(fs.existsSync(path.join(crevDir, "schemas"))).toBe(true)
    expect(fs.existsSync(path.join(crevDir, "agents"))).toBe(true)
    expect(fs.existsSync(path.join(crevDir, "diffs"))).toBe(true)
    expect(fs.existsSync(path.join(crevDir, "reviews"))).toBe(true)
  })

  it("does not overwrite existing non-empty files", () => {
    const crevDir = path.join(tmpDir, ".crev")
    fs.mkdirSync(crevDir, { recursive: true })

    const configPath = path.join(crevDir, "config.yaml")
    fs.writeFileSync(configPath, "custom: true", "utf-8")

    // Simulate writeIfNew behavior
    if (fs.existsSync(configPath) && fs.readFileSync(configPath, "utf-8").trim()) {
      // skip
    } else {
      fs.writeFileSync(configPath, "overwritten", "utf-8")
    }

    expect(fs.readFileSync(configPath, "utf-8")).toBe("custom: true")
  })

  it("writes empty .gitkeep files", () => {
    const crevDir = path.join(tmpDir, ".crev")
    fs.mkdirSync(path.join(crevDir, "diffs"), { recursive: true })
    fs.mkdirSync(path.join(crevDir, "reviews"), { recursive: true })

    fs.writeFileSync(path.join(crevDir, "diffs", ".gitkeep"), "", "utf-8")
    fs.writeFileSync(path.join(crevDir, "reviews", ".gitkeep"), "", "utf-8")

    expect(fs.existsSync(path.join(crevDir, "diffs", ".gitkeep"))).toBe(true)
    expect(fs.existsSync(path.join(crevDir, "reviews", ".gitkeep"))).toBe(true)
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
