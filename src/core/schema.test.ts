import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { ValidatedSchemaFile, applyModelOverrides, getModelOverrideFormatError, listSchemas, loadSchemaFile, parseModelOverrides, parseSchemaFile, resolveSchemaPath, validateAgentRefs, type SchemaFileType } from "./schema.js"

describe("schema validation", () => {
  it("parses a valid schema", () => {
    const result = ValidatedSchemaFile.safeParse({
      description: "Test schema",
      reviewers: [{ name: "Engineer", runtime: "claude", model: "sonnet" }],
    })
    expect(result.success).toBe(true)
  })

  it("requires at least one reviewer", () => {
    const result = ValidatedSchemaFile.safeParse({
      reviewers: [],
    })
    expect(result.success).toBe(false)
  })

  it("requires reviewer name", () => {
    const result = ValidatedSchemaFile.safeParse({
      reviewers: [{ name: "", runtime: "claude", model: "sonnet" }],
    })
    expect(result.success).toBe(false)
  })

  it("rejects invalid runtime", () => {
    const result = ValidatedSchemaFile.safeParse({
      reviewers: [{ name: "Test", runtime: "invalid", model: "test" }],
    })
    expect(result.success).toBe(false)
  })

  it("accepts unknown models — the runtime CLI is the authority", () => {
    const result = ValidatedSchemaFile.safeParse({
      reviewers: [{ name: "Test", runtime: "codex", model: "gpt-5.6-sol" }],
    })
    expect(result.success).toBe(true)
  })

  it("rejects prompt and agent together", () => {
    const result = ValidatedSchemaFile.safeParse({
      reviewers: [{ name: "Test", runtime: "claude", model: "sonnet", prompt: "test", agent: "test.md" }],
    })
    expect(result.success).toBe(false)
  })

  it("rejects coderabbit with prompt", () => {
    const result = ValidatedSchemaFile.safeParse({
      reviewers: [{ name: "Test", runtime: "coderabbit", model: "default", prompt: "test" }],
    })
    expect(result.success).toBe(false)
  })

  it("rejects coderabbit with agent", () => {
    const result = ValidatedSchemaFile.safeParse({
      reviewers: [{ name: "Test", runtime: "coderabbit", model: "default", agent: "test.md" }],
    })
    expect(result.success).toBe(false)
  })

  it("validates triage requires runtime and model when enabled", () => {
    const result = ValidatedSchemaFile.safeParse({
      reviewers: [{ name: "Test", runtime: "claude", model: "sonnet" }],
      triage: { enabled: true },
    })
    expect(result.success).toBe(false)
  })

  it("accepts triage with runtime and model", () => {
    const result = ValidatedSchemaFile.safeParse({
      reviewers: [{ name: "Test", runtime: "claude", model: "sonnet" }],
      triage: { enabled: true, runtime: "claude", model: "opus" },
    })
    expect(result.success).toBe(true)
  })

  it("accepts disabled triage without runtime/model", () => {
    const result = ValidatedSchemaFile.safeParse({
      reviewers: [{ name: "Test", runtime: "claude", model: "sonnet" }],
      triage: { enabled: false },
    })
    expect(result.success).toBe(true)
  })
})

describe("parseSchemaFile", () => {
  it("parses valid YAML", () => {
    const yaml = `
description: Test
reviewers:
  - name: Engineer
    runtime: claude
    model: sonnet
`
    const result = parseSchemaFile(yaml)
    expect(result.success).toBe(true)
  })

  it("reports errors for invalid YAML content", () => {
    const yaml = `
reviewers:
  - name: Test
    runtime: invalid
    model: test
`
    const result = parseSchemaFile(yaml)
    expect(result.success).toBe(false)
  })

  it("returns safe parse error for malformed YAML", () => {
    const yaml = `
reviewers:
  - name: Engineer
    runtime: claude
    model sonnet
`
    const result = parseSchemaFile(yaml)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues.some((i) => i.message.includes("Invalid YAML:"))).toBe(true)
    }
  })
})

describe("loadSchemaFile", () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "crev-test-"))
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true })
  })

  it("accepts unknown model values without static validation", () => {
    const schemaPath = path.join(tmpDir, "unknown-model.yaml")
    fs.writeFileSync(schemaPath, `
reviewers:
  - name: Engineer
    runtime: codex
    model: gpt-5.6-sol
`)
    const schema = loadSchemaFile(schemaPath)
    expect(schema.reviewers[0].model).toBe("gpt-5.6-sol")
  })

  it("expands a runtime/model alias in a reviewer's model field", () => {
    const schemaPath = path.join(tmpDir, "aliased.yaml")
    fs.writeFileSync(schemaPath, `
reviewers:
  - name: Engineer
    runtime: codex
    model: sol
`)
    const schema = loadSchemaFile(schemaPath, { sol: "pi/gpt-5.6-sol" })
    expect(schema.reviewers[0].runtime).toBe("pi")
    expect(schema.reviewers[0].model).toBe("gpt-5.6-sol")
  })

  it("lets a reviewer omit runtime when a runtime/model alias supplies it", () => {
    const schemaPath = path.join(tmpDir, "runtimeless.yaml")
    fs.writeFileSync(schemaPath, `
reviewers:
  - name: Engineer
    model: luna
`)
    const schema = loadSchemaFile(schemaPath, { luna: "codex/gpt-5.6-luna" })
    expect(schema.reviewers[0].runtime).toBe("codex")
    expect(schema.reviewers[0].model).toBe("gpt-5.6-luna")
  })

  it("rejects an alias that resolves to an unknown runtime", () => {
    const schemaPath = path.join(tmpDir, "bad-alias.yaml")
    fs.writeFileSync(schemaPath, `
reviewers:
  - name: Engineer
    model: sol
`)
    expect(() => loadSchemaFile(schemaPath, { sol: "fakert/whatever" })).toThrow(/fakert/)
  })

  it("throws friendly error for malformed YAML", () => {
    const schemaPath = path.join(tmpDir, "malformed.yaml")
    fs.writeFileSync(schemaPath, `
reviewers:
  - name: Engineer
    runtime: claude
    model sonnet
`)
    expect(() => loadSchemaFile(schemaPath)).toThrow(/Invalid schema file/)
  })
})

describe("listSchemas", () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "crev-test-"))
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true })
  })

  it("lists .yaml files", () => {
    fs.writeFileSync(path.join(tmpDir, "quick.yaml"), "")
    fs.writeFileSync(path.join(tmpDir, "standard.yml"), "")
    fs.writeFileSync(path.join(tmpDir, "readme.md"), "")

    const schemas = listSchemas(tmpDir)
    expect(schemas).toEqual(["quick", "standard"])
  })

  it("returns empty for non-existent directory", () => {
    expect(listSchemas("/nonexistent")).toEqual([])
  })
})

describe("resolveSchemaPath", () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "crev-test-"))
    fs.mkdirSync(path.join(tmpDir, "schemas"), { recursive: true })
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true })
  })

  it("resolves project .yml schemas", () => {
    const schemaPath = path.join(tmpDir, "schemas", "quick.yml")
    fs.writeFileSync(schemaPath, "reviewers:\n  - name: Engineer\n    runtime: claude\n    model: sonnet\n")
    expect(resolveSchemaPath("quick", tmpDir)).toBe(schemaPath)
  })

  it("prioritizes .local.yml over .yml", () => {
    const localPath = path.join(tmpDir, "schemas", "quick.local.yml")
    fs.writeFileSync(path.join(tmpDir, "schemas", "quick.yml"), "reviewers:\n  - name: A\n    runtime: claude\n    model: sonnet\n")
    fs.writeFileSync(localPath, "reviewers:\n  - name: B\n    runtime: claude\n    model: sonnet\n")
    expect(resolveSchemaPath("quick", tmpDir)).toBe(localPath)
  })
})

describe("validateAgentRefs", () => {
  let tmpDir: string
  let prevCwd: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "crev-test-"))
    prevCwd = process.cwd()
  })

  afterEach(() => {
    process.chdir(prevCwd)
    fs.rmSync(tmpDir, { recursive: true })
  })

  it("returns no issues when agent files exist", async () => {
    const agentFile = path.join(tmpDir, "security.md")
    fs.writeFileSync(agentFile, "persona")

    const issues = await validateAgentRefs(
      {
        reviewers: [{ name: "Test", runtime: "claude", model: "sonnet", agent: agentFile }],
      },
      { projectRoot: tmpDir },
    )
    expect(issues).toHaveLength(0)
  })

  it("returns error for missing agent file", async () => {
    const missingFile = path.join(tmpDir, "missing.md")
    const issues = await validateAgentRefs(
      {
        reviewers: [{ name: "Test", runtime: "claude", model: "sonnet", agent: missingFile }],
      },
      { projectRoot: tmpDir },
    )
    expect(issues).toHaveLength(1)
    expect(issues[0].severity).toBe("error")
    expect(issues[0].message).toContain("missing.md")
  })

  it("returns error when agent path escapes allowed roots", async () => {
    const issues = await validateAgentRefs(
      {
        reviewers: [{ name: "Test", runtime: "claude", model: "sonnet", agent: "/etc/passwd" }],
      },
      { projectRoot: tmpDir, crevDir: path.join(tmpDir, ".crev") },
    )
    expect(issues).toHaveLength(1)
    expect(issues[0].severity).toBe("error")
    expect(issues[0].message).toMatch(/outside the allowed roots/)
  })

  it("skips reviewers without agent", async () => {
    const issues = await validateAgentRefs({
      reviewers: [{ name: "Test", runtime: "claude", model: "sonnet" }],
    })
    expect(issues).toHaveLength(0)
  })

  it("resolves relative agent paths using schema/project context, not cwd", async () => {
    const projectRoot = tmpDir
    const crevDir = path.join(projectRoot, ".crev")
    const schemaPath = path.join(crevDir, "schemas", "custom.yaml")
    const agentPath = path.join(crevDir, "agents", "security.md")
    const nestedCwd = path.join(projectRoot, "apps", "web")

    fs.mkdirSync(path.dirname(schemaPath), { recursive: true })
    fs.mkdirSync(path.dirname(agentPath), { recursive: true })
    fs.mkdirSync(nestedCwd, { recursive: true })
    fs.writeFileSync(agentPath, "persona")

    process.chdir(nestedCwd)

    const issues = await validateAgentRefs(
      {
        reviewers: [{ name: "Security", runtime: "claude", model: "sonnet", agent: ".crev/agents/security.md" }],
      },
      { schemaPath, crevDir },
    )

    expect(issues).toHaveLength(0)
  })

  it("resolves bare agent filenames from .crev/agents", async () => {
    const projectRoot = tmpDir
    const crevDir = path.join(projectRoot, ".crev")
    const schemaPath = path.join(crevDir, "schemas", "custom.yaml")
    const agentPath = path.join(crevDir, "agents", "security.md")

    fs.mkdirSync(path.dirname(schemaPath), { recursive: true })
    fs.mkdirSync(path.dirname(agentPath), { recursive: true })
    fs.writeFileSync(agentPath, "persona")

    const issues = await validateAgentRefs(
      {
        reviewers: [{ name: "Security", runtime: "claude", model: "sonnet", agent: "security.md" }],
      },
      { schemaPath, crevDir },
    )

    expect(issues).toHaveLength(0)
  })
})

describe("parseModelOverrides", () => {
  it("returns empty overrides for empty array", () => {
    const result = parseModelOverrides([])
    expect(result.blanket).toBeUndefined()
    expect(result.targeted.size).toBe(0)
  })

  it("parses a single blanket override", () => {
    const result = parseModelOverrides(["codex/chatgpt-5.3"])
    expect(result.blanket).toEqual({ runtime: "codex", model: "chatgpt-5.3" })
    expect(result.targeted.size).toBe(0)
  })

  it("parses a single targeted override", () => {
    const result = parseModelOverrides(["Engineer=codex/chatgpt-5.3"])
    expect(result.blanket).toBeUndefined()
    expect(result.targeted.get("engineer")).toEqual({ runtime: "codex", model: "chatgpt-5.3" })
  })

  it("parses multiple targeted overrides", () => {
    const result = parseModelOverrides(["Engineer=codex/chatgpt-5.3", "Security=claude/sonnet"])
    expect(result.targeted.size).toBe(2)
    expect(result.targeted.get("engineer")).toEqual({ runtime: "codex", model: "chatgpt-5.3" })
    expect(result.targeted.get("security")).toEqual({ runtime: "claude", model: "sonnet" })
  })

  it("parses mixed blanket and targeted", () => {
    const result = parseModelOverrides(["codex/chatgpt-5.3", "Security=claude/sonnet"])
    expect(result.blanket).toEqual({ runtime: "codex", model: "chatgpt-5.3" })
    expect(result.targeted.get("security")).toEqual({ runtime: "claude", model: "sonnet" })
  })

  it("lowercases targeted reviewer name", () => {
    const result = parseModelOverrides(["SECURITY=claude/sonnet"])
    expect(result.targeted.has("security")).toBe(true)
    expect(result.targeted.has("SECURITY")).toBe(false)
  })

  it("last blanket wins when multiple provided", () => {
    const result = parseModelOverrides(["codex/chatgpt-5.3", "claude/opus"])
    expect(result.blanket).toEqual({ runtime: "claude", model: "opus" })
  })

  it("last targeted per-name wins when duplicates provided", () => {
    const result = parseModelOverrides(["Engineer=codex/chatgpt-5.3", "Engineer=claude/opus"])
    expect(result.targeted.get("engineer")).toEqual({ runtime: "claude", model: "opus" })
  })

  it("throws on invalid format without slash", () => {
    expect(() => parseModelOverrides(["noSlash"])).toThrow('Invalid --model format "noSlash"')
  })

  it("throws on empty name before equals", () => {
    expect(() => parseModelOverrides(["=claude/sonnet"])).toThrow("Reviewer name before")
  })

  it("throws on empty value after equals", () => {
    expect(() => parseModelOverrides(["Engineer="])).toThrow("Expected")
  })

  it("throws on value without slash after equals", () => {
    expect(() => parseModelOverrides(["Engineer=justmodel"])).toThrow("Expected")
  })

  it("handles model names with hyphens and dots", () => {
    const result = parseModelOverrides(["codex/gpt-5.3-codex"])
    expect(result.blanket).toEqual({ runtime: "codex", model: "gpt-5.3-codex" })
  })

  it("handles reviewer names with spaces", () => {
    const result = parseModelOverrides(["Security Expert=claude/sonnet"])
    expect(result.targeted.get("security expert")).toEqual({ runtime: "claude", model: "sonnet" })
  })
})

describe("getModelOverrideFormatError", () => {
  it("returns null for valid blanket override", () => {
    const overrides = parseModelOverrides(["claude/sonnet"])
    expect(getModelOverrideFormatError(overrides)).toBeNull()
  })

  it("returns null for valid targeted override", () => {
    const overrides = parseModelOverrides(["Engineer=claude/sonnet"])
    expect(getModelOverrideFormatError(overrides)).toBeNull()
  })

  it("returns null for empty overrides", () => {
    const overrides = parseModelOverrides([])
    expect(getModelOverrideFormatError(overrides)).toBeNull()
  })

  it("returns error for blanket with unknown runtime", () => {
    const overrides = parseModelOverrides(["fakert/somemodel"])
    const err = getModelOverrideFormatError(overrides)
    expect(err).toContain("unknown runtime")
    expect(err).toContain("fakert")
  })

  it("accepts an unknown model on a valid runtime (no static model check)", () => {
    const overrides = parseModelOverrides(["codex/gpt-5.6-sol"])
    expect(getModelOverrideFormatError(overrides)).toBeNull()
  })

  it("returns error for targeted with unknown runtime", () => {
    const overrides = parseModelOverrides(["Engineer=fakert/somemodel"])
    const err = getModelOverrideFormatError(overrides)
    expect(err).toContain("unknown runtime")
    expect(err).toContain("fakert")
  })

  it("accepts a targeted unknown model on a valid runtime", () => {
    const overrides = parseModelOverrides(["Engineer=codex/gpt-5.6-terra"])
    expect(getModelOverrideFormatError(overrides)).toBeNull()
  })
})

describe("applyModelOverrides", () => {
  const baseSchema: SchemaFileType = {
    reviewers: [
      { name: "Engineer", runtime: "claude", model: "sonnet", prompt: "Review for bugs." },
      { name: "Security", runtime: "claude", model: "opus", prompt: "Check security." },
    ],
  }

  it("returns schema unchanged when overrides are empty", () => {
    const overrides = parseModelOverrides([])
    const result = applyModelOverrides(baseSchema, overrides)
    expect(result).toEqual(baseSchema)
  })

  it("blanket override replaces all reviewers' runtime and model", () => {
    const overrides = parseModelOverrides(["gemini/gemini-2.5-flash"])
    const result = applyModelOverrides(baseSchema, overrides)
    expect(result.reviewers[0].runtime).toBe("gemini")
    expect(result.reviewers[0].model).toBe("gemini-2.5-flash")
    expect(result.reviewers[1].runtime).toBe("gemini")
    expect(result.reviewers[1].model).toBe("gemini-2.5-flash")
  })

  it("targeted override replaces only matching reviewer", () => {
    const overrides = parseModelOverrides(["Engineer=gemini/gemini-2.5-flash"])
    const result = applyModelOverrides(baseSchema, overrides)
    expect(result.reviewers[0].runtime).toBe("gemini")
    expect(result.reviewers[0].model).toBe("gemini-2.5-flash")
    expect(result.reviewers[1].runtime).toBe("claude")
    expect(result.reviewers[1].model).toBe("opus")
  })

  it("targeted override is case-insensitive", () => {
    const overrides = parseModelOverrides(["ENGINEER=gemini/gemini-2.5-flash"])
    const result = applyModelOverrides(baseSchema, overrides)
    expect(result.reviewers[0].runtime).toBe("gemini")
    expect(result.reviewers[0].model).toBe("gemini-2.5-flash")
  })

  it("mixed: targeted wins for match, blanket for others", () => {
    const overrides = parseModelOverrides(["gemini/gemini-2.5-flash", "Security=claude/sonnet"])
    const result = applyModelOverrides(baseSchema, overrides)
    // Engineer gets blanket
    expect(result.reviewers[0].runtime).toBe("gemini")
    expect(result.reviewers[0].model).toBe("gemini-2.5-flash")
    // Security gets targeted
    expect(result.reviewers[1].runtime).toBe("claude")
    expect(result.reviewers[1].model).toBe("sonnet")
  })

  it("preserves other reviewer fields", () => {
    const overrides = parseModelOverrides(["gemini/gemini-2.5-flash"])
    const result = applyModelOverrides(baseSchema, overrides)
    expect(result.reviewers[0].name).toBe("Engineer")
    expect(result.reviewers[0].prompt).toBe("Review for bugs.")
    expect(result.reviewers[1].name).toBe("Security")
    expect(result.reviewers[1].prompt).toBe("Check security.")
  })

  it("does not mutate the input schema", () => {
    const overrides = parseModelOverrides(["gemini/gemini-2.5-flash"])
    applyModelOverrides(baseSchema, overrides)
    expect(baseSchema.reviewers[0].runtime).toBe("claude")
    expect(baseSchema.reviewers[0].model).toBe("sonnet")
  })

  it("does not affect triage settings", () => {
    const schemaWithTriage: SchemaFileType = {
      ...baseSchema,
      triage: { enabled: true, runtime: "claude", model: "opus" },
    }
    const overrides = parseModelOverrides(["gemini/gemini-2.5-flash"])
    const result = applyModelOverrides(schemaWithTriage, overrides)
    expect(result.triage?.runtime).toBe("claude")
    expect(result.triage?.model).toBe("opus")
  })
})
