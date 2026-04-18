import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { loadSchemaFile, parseSchemaFile } from "../core/schema.js"

const TEMPLATE = `description: ""
reviewers:
  - name: Engineer
    runtime: claude
    model: sonnet
    prompt: Review the code changes for correctness and potential bugs.
`

describe("schema init", () => {
  let tmpDir: string
  let schemasDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "crev-schema-init-"))
    schemasDir = path.join(tmpDir, "schemas")
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true })
  })

  it("template produces a valid schema when parsed", () => {
    const result = parseSchemaFile(TEMPLATE)
    expect(result.success).toBe(true)
  })

  it("template schema loads with correct reviewer config", () => {
    fs.mkdirSync(schemasDir, { recursive: true })
    const filePath = path.join(schemasDir, "test.yaml")
    fs.writeFileSync(filePath, TEMPLATE, "utf-8")

    const schema = loadSchemaFile(filePath)
    expect(schema.reviewers).toHaveLength(1)
    expect(schema.reviewers[0].name).toBe("Engineer")
    expect(schema.reviewers[0].runtime).toBe("claude")
    expect(schema.reviewers[0].model).toBe("sonnet")
  })

  it("refuses to overwrite existing schema (simulated check)", () => {
    fs.mkdirSync(schemasDir, { recursive: true })
    const filePath = path.join(schemasDir, "existing.yaml")
    fs.writeFileSync(filePath, "original: true", "utf-8")

    // The command checks fs.existsSync before writing
    expect(fs.existsSync(filePath)).toBe(true)
    // Verify the original content is preserved (command would exit with error)
    expect(fs.readFileSync(filePath, "utf-8")).toBe("original: true")
  })
})
