import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { parseSchemaFile, validateAgentRefs, loadSchemaFile, listSchemas } from "../core/schema.js"

describe("validate command logic", () => {
  let tmpDir: string
  let schemasDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "crev-validate-"))
    schemasDir = path.join(tmpDir, "schemas")
    fs.mkdirSync(schemasDir, { recursive: true })
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true })
  })

  it("validates a valid schema", () => {
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

  it("reports errors for invalid schema", () => {
    const yaml = `
reviewers:
  - name: Test
    runtime: invalid_runtime
    model: test
`
    const result = parseSchemaFile(yaml)
    expect(result.success).toBe(false)
  })

  it("validates all schemas in directory", () => {
    fs.writeFileSync(
      path.join(schemasDir, "good.yaml"),
      "reviewers:\n  - name: A\n    runtime: claude\n    model: sonnet\n",
    )
    fs.writeFileSync(
      path.join(schemasDir, "bad.yaml"),
      "reviewers: []\n",
    )

    const schemas = listSchemas(schemasDir)
    expect(schemas).toEqual(["bad", "good"])

    const goodResult = parseSchemaFile(fs.readFileSync(path.join(schemasDir, "good.yaml"), "utf-8"))
    expect(goodResult.success).toBe(true)

    const badResult = parseSchemaFile(fs.readFileSync(path.join(schemasDir, "bad.yaml"), "utf-8"))
    expect(badResult.success).toBe(false)
  })

  it("reports missing agent files", async () => {
    fs.writeFileSync(
      path.join(schemasDir, "test.yaml"),
      "reviewers:\n  - name: A\n    runtime: claude\n    model: sonnet\n    agent: /nonexistent/missing.md\n",
    )

    const schema = loadSchemaFile(path.join(schemasDir, "test.yaml"))
    const issues = await validateAgentRefs(schema)
    expect(issues).toHaveLength(1)
    expect(issues[0].message).toContain("missing.md")
  })

  it("passes when agent file exists", async () => {
    const agentFile = path.join(tmpDir, "engineer.md")
    fs.writeFileSync(agentFile, "persona")
    fs.writeFileSync(
      path.join(schemasDir, "test.yaml"),
      `reviewers:\n  - name: A\n    runtime: claude\n    model: sonnet\n    agent: ${agentFile}\n`,
    )

    const schema = loadSchemaFile(path.join(schemasDir, "test.yaml"))
    const issues = await validateAgentRefs(schema)
    expect(issues).toHaveLength(0)
  })
})
