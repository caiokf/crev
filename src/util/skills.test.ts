import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { writeSkill, getInstalledSkills, isSkillUpToDate } from "./skills.js"
import { skillContent } from "../templates/skills/skill.js"
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

describe("getInstalledSkills", () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "crev-installed-"))
    vi.spyOn(console, "log").mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it("returns only tools that have skill files installed", () => {
    // Create marker dirs for claude and cursor
    fs.mkdirSync(path.join(tmpDir, ".claude"), { recursive: true })
    fs.mkdirSync(path.join(tmpDir, ".cursor"), { recursive: true })

    // Only install skill for claude
    fs.mkdirSync(path.join(tmpDir, ".claude/skills/crev"), { recursive: true })
    fs.writeFileSync(path.join(tmpDir, ".claude/skills/crev/SKILL.md"), skillContent)

    const installed = getInstalledSkills(tmpDir)
    expect(installed).toHaveLength(1)
    expect(installed[0].id).toBe("claude")
  })

  it("returns empty list when no skills are installed", () => {
    // Marker dirs exist but no skill files
    fs.mkdirSync(path.join(tmpDir, ".claude"), { recursive: true })
    fs.mkdirSync(path.join(tmpDir, ".cursor"), { recursive: true })

    const installed = getInstalledSkills(tmpDir)
    expect(installed).toHaveLength(0)
  })

  it("detects codex-cli skill via managed section in AGENTS.md", () => {
    fs.writeFileSync(
      path.join(tmpDir, "AGENTS.md"),
      "# Agents\n\n<!-- crev:codex:start -->\n## crev\n<!-- crev:codex:end -->\n",
    )

    const installed = getInstalledSkills(tmpDir)
    expect(installed.some((t) => t.id === "codex-cli")).toBe(true)
  })
})

describe("skill template parity", () => {
  it("stays byte-identical to the committed SKILL.md in this repo", () => {
    // The template is the source of truth — `crev update` writes its
    // decoded value verbatim into `.claude/skills/crev/SKILL.md`. If
    // anyone edits one without the other they drift, and agents
    // running `crev update` would clobber the real docs. Pin them.
    const repoSkillPath = path.join(__dirname, "..", "..", ".claude/skills/crev/SKILL.md")
    if (!fs.existsSync(repoSkillPath)) return // not checked out (e.g. published package)
    const committed = fs.readFileSync(repoSkillPath, "utf-8")
    expect(skillContent).toBe(committed)
  })
})

describe("isSkillUpToDate", () => {
  let tmpDir: string

  const claudeTool: AITool = {
    name: "Claude Code",
    id: "claude",
    detected: true,
    detectionPath: ".claude",
    skillPath: ".claude/skills/crev",
  }

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "crev-uptodate-"))
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it("returns true when skill file matches template", () => {
    fs.mkdirSync(path.join(tmpDir, ".claude/skills/crev"), { recursive: true })
    fs.writeFileSync(path.join(tmpDir, ".claude/skills/crev/SKILL.md"), skillContent)

    expect(isSkillUpToDate(tmpDir, claudeTool)).toBe(true)
  })

  it("returns false when skill file is outdated", () => {
    fs.mkdirSync(path.join(tmpDir, ".claude/skills/crev"), { recursive: true })
    fs.writeFileSync(path.join(tmpDir, ".claude/skills/crev/SKILL.md"), "old content")

    expect(isSkillUpToDate(tmpDir, claudeTool)).toBe(false)
  })

  it("returns false when skill file does not exist", () => {
    expect(isSkillUpToDate(tmpDir, claudeTool)).toBe(false)
  })
})
