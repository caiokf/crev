import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { resolveAgentPath } from "./agent-path.js"

describe("resolveAgentPath", () => {
  let tmp = ""
  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "crev-agent-path-"))
  })
  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true })
  })

  it("normalises absolute paths inside an allowed root", () => {
    const abs = path.join(tmp, "nested/../agent.md")
    const resolved = resolveAgentPath(abs, { projectRoot: tmp })
    expect(path.isAbsolute(resolved)).toBe(true)
    expect(resolved).toBe(path.normalize(abs))
  })

  it("rejects absolute paths outside all allowed roots", () => {
    // Use a path under /etc which is not under tmp, cwd, or any crev dir.
    expect(() =>
      resolveAgentPath("/etc/passwd", { projectRoot: tmp, crevDir: path.join(tmp, ".crev") }),
    ).toThrow(/outside the allowed roots/)
  })

  it("rejects relative traversal that escapes the project root", () => {
    const projectRoot = path.join(tmp, "project")
    fs.mkdirSync(projectRoot, { recursive: true })
    expect(() =>
      resolveAgentPath("../../etc/passwd", { projectRoot, crevDir: path.join(projectRoot, ".crev") }),
    ).toThrow(/outside the allowed roots/)
  })

  it("looks up bare filenames under <crevDir>/agents first", () => {
    const crevDir = path.join(tmp, ".crev")
    const agentsDir = path.join(crevDir, "agents")
    fs.mkdirSync(agentsDir, { recursive: true })
    const expected = path.join(agentsDir, "security.md")
    fs.writeFileSync(expected, "rules")

    const resolved = resolveAgentPath("security.md", { crevDir })
    expect(resolved).toBe(expected)
  })

  it("falls back to the schema directory for relative paths with slashes", () => {
    const schemaDir = path.join(tmp, "schemas")
    fs.mkdirSync(schemaDir, { recursive: true })
    const target = path.join(schemaDir, "a/security.md")
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.writeFileSync(target, "rules")

    const resolved = resolveAgentPath("a/security.md", {
      schemaPath: path.join(schemaDir, "quick.yaml"),
    })
    expect(resolved).toBe(target)
  })

  it("prefers an existing project-root match over the cwd fallback", () => {
    const projectRoot = path.join(tmp, "project")
    fs.mkdirSync(projectRoot, { recursive: true })
    const target = path.join(projectRoot, "docs/agent.md")
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.writeFileSync(target, "rules")

    const resolved = resolveAgentPath("docs/agent.md", {
      projectRoot,
      cwd: path.join(tmp, "somewhere-else"),
    })
    expect(resolved).toBe(target)
  })

  it("returns the first candidate when nothing exists on disk", () => {
    const crevDir = path.join(tmp, ".crev")
    const resolved = resolveAgentPath("does-not-exist.md", { crevDir })
    // First candidate for bare filenames is <crevDir>/agents/<name>
    expect(resolved).toBe(path.resolve(crevDir, "agents/does-not-exist.md"))
  })

  it("falls back to cwd when no context is provided", () => {
    const resolved = resolveAgentPath("missing.md", { cwd: tmp })
    expect(resolved).toBe(path.resolve(tmp, "missing.md"))
  })
})
