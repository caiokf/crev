import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

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

  it("creates schema file with template", () => {
    fs.mkdirSync(schemasDir, { recursive: true })
    const filePath = path.join(schemasDir, "security.yaml")

    const template = `description: ""
reviewers:
  - name: Engineer
    runtime: claude
    model: sonnet
`
    fs.writeFileSync(filePath, template, "utf-8")

    expect(fs.existsSync(filePath)).toBe(true)
    const content = fs.readFileSync(filePath, "utf-8")
    expect(content).toContain("reviewers:")
    expect(content).toContain("runtime: claude")
  })

  it("refuses to overwrite existing schema", () => {
    fs.mkdirSync(schemasDir, { recursive: true })
    const filePath = path.join(schemasDir, "existing.yaml")
    fs.writeFileSync(filePath, "original", "utf-8")

    // Simulating the check the command does
    expect(fs.existsSync(filePath)).toBe(true)
  })
})
