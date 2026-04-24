import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { detectAITools } from "./detect-tools.js"

describe("detectAITools", () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "crev-detect-"))
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it("reports every known tool as not detected in an empty project", () => {
    const tools = detectAITools(tmpDir)
    expect(tools.length).toBeGreaterThan(0)
    for (const tool of tools) {
      expect(tool.detected).toBe(false)
    }
  })

  it("detects Claude Code when .claude exists", () => {
    fs.mkdirSync(path.join(tmpDir, ".claude"))
    const tools = detectAITools(tmpDir)
    const claude = tools.find((t) => t.id === "claude")
    expect(claude?.detected).toBe(true)
  })

  it("detects Codex CLI via the AGENTS.md file marker", () => {
    fs.writeFileSync(path.join(tmpDir, "AGENTS.md"), "# hi")
    const tools = detectAITools(tmpDir)
    const codex = tools.find((t) => t.id === "codex-cli")
    expect(codex?.detected).toBe(true)
  })

  it("leaves non-matching tools undetected when only one marker is present", () => {
    fs.mkdirSync(path.join(tmpDir, ".claude"))
    const tools = detectAITools(tmpDir)
    const cursor = tools.find((t) => t.id === "cursor")
    expect(cursor?.detected).toBe(false)
  })

  it("fills in skillPath / detectionPath even when the tool is absent", () => {
    const tools = detectAITools(tmpDir)
    const claude = tools.find((t) => t.id === "claude")
    expect(claude?.detectionPath).toBe(".claude")
    expect(claude?.skillPath).toBe(".claude/skills/crev")
    expect(claude?.commandPath).toBe(".claude/commands")
  })

  it("exposes an undefined commandPath for tools that do not define one", () => {
    const tools = detectAITools(tmpDir)
    const copilot = tools.find((t) => t.id === "copilot")
    expect(copilot?.commandPath).toBeUndefined()
  })
})
