import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { writeSkill } from "./skills.js"
import type { AITool } from "./detect-tools.js"

describe("writeSkill (codex-cli)", () => {
  let tmpDir: string

  const codexTool: AITool = {
    name: "Codex CLI",
    id: "codex-cli",
    detected: true,
    detectionPath: "AGENTS.md",
    skillPath: ".",
  }

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "crev-skills-"))
    vi.spyOn(console, "log").mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it("adds a managed crev section to AGENTS.md", () => {
    fs.writeFileSync(path.join(tmpDir, "AGENTS.md"), "# Project instructions\n")

    writeSkill(tmpDir, codexTool)

    const agents = fs.readFileSync(path.join(tmpDir, "AGENTS.md"), "utf-8")
    expect(agents).toContain("<!-- crev:codex:start -->")
    expect(agents).toContain("## crev")
    expect(agents).toContain("crev run --schema quick --base main")
    expect(agents).toContain("<!-- crev:codex:end -->")
  })

  it("does not duplicate the managed section on repeated init writes", () => {
    fs.writeFileSync(path.join(tmpDir, "AGENTS.md"), "# Project instructions\n")

    writeSkill(tmpDir, codexTool)
    writeSkill(tmpDir, codexTool)

    const agents = fs.readFileSync(path.join(tmpDir, "AGENTS.md"), "utf-8")
    const matches = agents.match(/<!-- crev:codex:start -->/g) ?? []
    expect(matches).toHaveLength(1)
  })

  it("replaces the managed section when overwrite=true", () => {
    fs.writeFileSync(
      path.join(tmpDir, "AGENTS.md"),
      [
        "# Project instructions",
        "",
        "<!-- crev:codex:start -->",
        "stale content",
        "<!-- crev:codex:end -->",
        "",
        "## Other",
      ].join("\n"),
    )

    writeSkill(tmpDir, codexTool, true)

    const agents = fs.readFileSync(path.join(tmpDir, "AGENTS.md"), "utf-8")
    expect(agents).toContain("## crev")
    expect(agents).not.toContain("stale content")
    expect(agents).toContain("## Other")
  })
})
