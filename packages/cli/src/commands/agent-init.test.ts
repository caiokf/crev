import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

describe("agent init", () => {
  let tmpDir: string
  let agentsDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "crev-agent-init-"))
    agentsDir = path.join(tmpDir, "agents")
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true })
  })

  it("creates agent file with template", () => {
    fs.mkdirSync(agentsDir, { recursive: true })
    const filePath = path.join(agentsDir, "devops.md")

    const template = `You are a code reviewer focused on [AREA].

Focus on:
- [Primary concern]
- [Secondary concern]
- [Additional focus area]

Ignore: style, naming, formatting (unless they affect correctness).
`
    fs.writeFileSync(filePath, template, "utf-8")

    expect(fs.existsSync(filePath)).toBe(true)
    const content = fs.readFileSync(filePath, "utf-8")
    expect(content).toContain("code reviewer")
    expect(content).toContain("Focus on:")
  })

  it("refuses to overwrite existing agent", () => {
    fs.mkdirSync(agentsDir, { recursive: true })
    const filePath = path.join(agentsDir, "existing.md")
    fs.writeFileSync(filePath, "original", "utf-8")

    expect(fs.existsSync(filePath)).toBe(true)
  })
})
