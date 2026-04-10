import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { ValidatedSchemaFile, listSchemas, parseSchemaFile, validateAgentRefs } from "./schema.js"

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

  it("rejects invalid model for runtime", () => {
    const result = ValidatedSchemaFile.safeParse({
      reviewers: [{ name: "Test", runtime: "claude", model: "gpt-5" }],
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues.some((i) => i.message.includes("Invalid model"))).toBe(true)
    }
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

describe("validateAgentRefs", () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "crev-test-"))
    fs.mkdirSync(path.join(tmpDir, "agents"), { recursive: true })
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true })
  })

  it("returns no issues when agent files exist", async () => {
    fs.writeFileSync(path.join(tmpDir, "agents", "security.md"), "persona")

    const issues = await validateAgentRefs(
      { reviewers: [{ name: "Test", runtime: "claude", model: "sonnet", agent: "security.md" }] },
      tmpDir,
    )
    expect(issues).toHaveLength(0)
  })

  it("returns error for missing agent file", async () => {
    const issues = await validateAgentRefs(
      { reviewers: [{ name: "Test", runtime: "claude", model: "sonnet", agent: "missing.md" }] },
      tmpDir,
    )
    expect(issues).toHaveLength(1)
    expect(issues[0].severity).toBe("error")
    expect(issues[0].message).toContain("missing.md")
  })

  it("skips reviewers without agent", async () => {
    const issues = await validateAgentRefs(
      { reviewers: [{ name: "Test", runtime: "claude", model: "sonnet" }] },
      tmpDir,
    )
    expect(issues).toHaveLength(0)
  })
})
