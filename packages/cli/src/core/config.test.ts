import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { getOutputDir, loadAgentPrompt, loadConfig, resolveModelAlias } from "./config.js"

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
  context:
    - "docs/"
`
    fs.writeFileSync(path.join(tmpDir, "config.yaml"), yaml)

    const config = loadConfig(tmpDir)
    expect(config.defaults.schema).toBe("standard")
    expect(config.defaults.base).toBe("develop")
    expect(config.diff.exclude).toEqual(["pnpm-lock.yaml"])
    expect(config.triage.enabled).toBe(true)
    expect(config.triage.context).toEqual(["docs/"])
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
    fs.writeFileSync(path.join(tmpDir, "agents", "security.md"), "You are a security reviewer.")
    const prompt = loadAgentPrompt("security.md", tmpDir)
    expect(prompt).toBe("You are a security reviewer.")
  })

  it("returns null for missing agent", () => {
    const prompt = loadAgentPrompt("missing.md", tmpDir)
    expect(prompt).toBeNull()
  })
})
