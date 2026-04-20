import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { findCrevDir, getOutputDir, loadAgentPrompt, loadConfig, resolveModelAlias, resolveClaudeModelId } from "./config.js"

describe("loadConfig", () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "crev-test-"))
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true })
  })

  it("returns defaults when no config file exists", () => {
    const config = loadConfig(tmpDir)
    expect(config.defaults.schema).toBe("quick")
    expect(config.defaults.base).toBe("main")
    expect(config.defaults.type).toBe("all")
    expect(config.normalizer.enabled).toBe(true)
    expect(config.triage.enabled).toBe(false)
  })

  it("loads and validates config.yaml", () => {
    const yaml = `
defaults:
  schema: standard
  base: develop
diff:
  exclude:
    - "pnpm-lock.yaml"
triage:
  enabled: true
  runtime: claude
  model: opus
`
    fs.writeFileSync(path.join(tmpDir, "config.yaml"), yaml)

    const config = loadConfig(tmpDir)
    expect(config.defaults.schema).toBe("standard")
    expect(config.defaults.base).toBe("develop")
    expect(config.diff.exclude).toEqual(["pnpm-lock.yaml"])
    expect(config.triage.enabled).toBe(true)
  })

  it("applies defaults for missing fields", () => {
    fs.writeFileSync(path.join(tmpDir, "config.yaml"), "defaults:\n  schema: custom\n")

    const config = loadConfig(tmpDir)
    expect(config.defaults.schema).toBe("custom")
    expect(config.defaults.base).toBe("main")
    expect(config.normalizer.runtime).toBe("claude")
  })
})

describe("resolveModelAlias", () => {
  it("returns alias when defined", () => {
    const config = loadConfig("/nonexistent")
    ;(config.aliases as Record<string, string>)["claude-opus-4-6"] = "opus"
    expect(resolveModelAlias(config, "claude-opus-4-6")).toBe("opus")
  })

  it("returns model as-is when no alias", () => {
    const config = loadConfig("/nonexistent")
    expect(resolveModelAlias(config, "sonnet")).toBe("sonnet")
  })
})

describe("resolveClaudeModelId", () => {
  it("resolves 'opus' to full Claude model ID", () => {
    const config = loadConfig("/nonexistent")
    expect(resolveClaudeModelId(config, "opus")).toBe("claude-opus-4-6")
  })

  it("resolves 'sonnet' to full Claude model ID", () => {
    const config = loadConfig("/nonexistent")
    expect(resolveClaudeModelId(config, "sonnet")).toBe("claude-sonnet-4-6")
  })

  it("resolves 'haiku' to full Claude model ID", () => {
    const config = loadConfig("/nonexistent")
    expect(resolveClaudeModelId(config, "haiku")).toBe("claude-haiku-4-5-20251001")
  })

  it("passes through full model IDs unchanged", () => {
    const config = loadConfig("/nonexistent")
    expect(resolveClaudeModelId(config, "claude-opus-4-6")).toBe("claude-opus-4-6")
  })

  it("passes through unknown model names unchanged", () => {
    const config = loadConfig("/nonexistent")
    expect(resolveClaudeModelId(config, "gpt-5.4")).toBe("gpt-5.4")
  })

  it("applies user aliases before Claude shorthands", () => {
    const config = loadConfig("/nonexistent")
    ;(config.aliases as Record<string, string>)["fast"] = "haiku"
    expect(resolveClaudeModelId(config, "fast")).toBe("claude-haiku-4-5-20251001")
  })

  it("user alias to full ID bypasses shorthands", () => {
    const config = loadConfig("/nonexistent")
    ;(config.aliases as Record<string, string>)["default"] = "claude-sonnet-4-6"
    expect(resolveClaudeModelId(config, "default")).toBe("claude-sonnet-4-6")
  })
})

describe("getOutputDir", () => {
  it("resolves relative path from crev dir parent", () => {
    const result = getOutputDir(
      { output: { dir: ".crev/reviews", format: "json" } } as ReturnType<typeof loadConfig>,
      "/project/.crev",
    )
    expect(result).toBe(path.resolve("/project", ".crev/reviews"))
  })
})

describe("loadAgentPrompt", () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "crev-test-"))
    fs.mkdirSync(path.join(tmpDir, "agents"), { recursive: true })
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true })
  })

  it("loads agent file content", () => {
    const agentPath = path.join(tmpDir, "agents", "security.md")
    fs.writeFileSync(agentPath, "You are a security reviewer.")
    const prompt = loadAgentPrompt(agentPath)
    expect(prompt).toBe("You are a security reviewer.")
  })

  it("returns null for missing agent", () => {
    const prompt = loadAgentPrompt(path.join(tmpDir, "agents", "missing.md"))
    expect(prompt).toBeNull()
  })
})

describe("findCrevDir", () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "crev-test-"))
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it(".crev exists in startDir — returns that path", () => {
    fs.mkdirSync(path.join(tmpDir, ".crev"))
    expect(findCrevDir(tmpDir)).toBe(path.join(tmpDir, ".crev"))
  })

  it(".crev exists in parent directory — walks up and finds it", () => {
    fs.mkdirSync(path.join(tmpDir, ".crev"))
    const childDir = path.join(tmpDir, "packages", "cli")
    fs.mkdirSync(childDir, { recursive: true })
    expect(findCrevDir(childDir)).toBe(path.join(tmpDir, ".crev"))
  })

  it("no .crev anywhere — returns fallback .crev relative to startDir", () => {
    const emptyDir = path.join(tmpDir, "empty")
    fs.mkdirSync(emptyDir)
    expect(findCrevDir(emptyDir)).toBe(path.resolve(emptyDir, ".crev"))
  })
})
