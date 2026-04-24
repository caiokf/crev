import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { formatRow } from "./schemas-list.js"
import {
  formatReviewerRow,
  loadReviewerPrompt,
  renderReviewerPrompt,
  renderSchemaMeta,
} from "./schema-detail.js"
import type { SchemaDetail } from "../../actions/schema.js"

describe("schemas list · formatRow", () => {
  it("shows name, reviewer count, and description", () => {
    const row = formatRow({ name: "quick", description: "fast review", reviewers: 2 })
    expect(row).toContain("quick")
    expect(row).toContain("2 reviewers")
    expect(row).toContain("fast review")
  })

  it("singularises a single-reviewer row", () => {
    const row = formatRow({ name: "tiny", description: "", reviewers: 1 })
    expect(row).toContain("1 reviewer ")
  })

  it("shows an error in red when the schema failed to load", () => {
    const row = formatRow({ name: "broken", description: "", reviewers: 0, error: "bad yaml" })
    expect(row).toContain("{red-fg}bad yaml{/red-fg}")
  })

  it("marks a blank description as such", () => {
    const row = formatRow({ name: "plain", description: "", reviewers: 3 })
    expect(row).toContain("(no description)")
  })
})

describe("schema detail · renderSchemaMeta", () => {
  const detail: SchemaDetail = {
    name: "quick",
    path: "/repo/.crev/schemas/quick.yaml",
    description: "fast check",
    reviewers: [
      { name: "Engineer", runtime: "claude", model: "sonnet", prompt: "review" },
    ],
  }

  it("renders name, description, and relative source path", () => {
    const out = renderSchemaMeta(detail, "/repo/.crev")
    expect(out).toContain("quick")
    expect(out).toContain("fast check")
    expect(out).toContain("source: schemas/quick.yaml")
  })

  it("appends an enabled triage block when configured", () => {
    const out = renderSchemaMeta(
      { ...detail, triage: { enabled: true, runtime: "claude", model: "sonnet" } },
      "/repo/.crev",
    )
    expect(out).toContain("triage")
    expect(out).toContain("enabled")
    expect(out).toContain("runtime: claude/sonnet")
  })

  it("omits triage when not configured", () => {
    const out = renderSchemaMeta(detail, "/repo/.crev")
    expect(out).not.toContain("triage")
  })
})

describe("schema detail · formatReviewerRow", () => {
  it("labels reviewers with an inline prompt", () => {
    const row = formatReviewerRow({
      name: "Engineer",
      runtime: "claude",
      model: "sonnet",
      prompt: "review",
    })
    expect(row).toContain("Engineer")
    expect(row).toContain("claude/sonnet")
    expect(row).toContain("(inline prompt)")
  })

  it("labels reviewers pointing at an agent file", () => {
    const row = formatReviewerRow({
      name: "Security",
      runtime: "claude",
      model: "opus",
      agent: "security.md",
    })
    expect(row).toContain("Security")
    expect(row).toContain("→ security.md")
  })
})

describe("schema detail · loadReviewerPrompt", () => {
  let tmpDir = ""

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "crev-dash-schema-"))
  })
  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it("returns the inline prompt verbatim", () => {
    const info = loadReviewerPrompt(
      { name: "E", runtime: "claude", model: "sonnet", prompt: "hello" },
      path.join(tmpDir, "schema.yaml"),
      tmpDir,
    )
    expect(info).toEqual({ kind: "inline", prompt: "hello" })
  })

  it("reads the agent file content when the reference resolves", () => {
    const agentPath = path.join(tmpDir, "security.md")
    fs.writeFileSync(agentPath, "# audit rules\nbe careful")
    const info = loadReviewerPrompt(
      { name: "Sec", runtime: "claude", model: "opus", agent: "security.md" },
      path.join(tmpDir, "schema.yaml"),
      tmpDir,
    )
    expect(info.kind).toBe("agent")
    if (info.kind !== "agent") return
    expect(info.ref).toBe("security.md")
    expect(info.content).toContain("audit rules")
    expect(info.error).toBeNull()
  })

  it("returns an error when the agent file is missing", () => {
    const info = loadReviewerPrompt(
      { name: "Sec", runtime: "claude", model: "opus", agent: "nope.md" },
      path.join(tmpDir, "schema.yaml"),
      tmpDir,
    )
    expect(info.kind).toBe("agent")
    if (info.kind !== "agent") return
    expect(info.content).toBeNull()
    expect(info.error).toMatch(/not found/i)
  })

  it("returns none when neither prompt nor agent is set", () => {
    const info = loadReviewerPrompt(
      { name: "CR", runtime: "coderabbit", model: "default" },
      path.join(tmpDir, "schema.yaml"),
      tmpDir,
    )
    expect(info.kind).toBe("none")
  })
})

describe("schema detail · renderReviewerPrompt", () => {
  const reviewer = { name: "Engineer", runtime: "claude", model: "sonnet" }

  it("renders the inline prompt body", () => {
    const out = renderReviewerPrompt(
      { kind: "inline", prompt: "review carefully" },
      { ...reviewer, prompt: "review carefully" },
    )
    expect(out).toContain("Engineer")
    expect(out).toContain("inline prompt")
    expect(out).toContain("review carefully")
  })

  it("renders agent content with the resolved path", () => {
    const out = renderReviewerPrompt(
      {
        kind: "agent",
        ref: "security.md",
        resolvedPath: "/repo/.crev/agents/security.md",
        content: "# audit rules",
        error: null,
      },
      { ...reviewer, agent: "security.md" },
    )
    expect(out).toContain("security.md")
    expect(out).toContain("/repo/.crev/agents/security.md")
    expect(out).toContain("audit rules")
  })

  it("surfaces agent file errors in red", () => {
    const out = renderReviewerPrompt(
      {
        kind: "agent",
        ref: "missing.md",
        resolvedPath: "/repo/missing.md",
        content: null,
        error: "Agent file not found",
      },
      { ...reviewer, agent: "missing.md" },
    )
    expect(out).toContain("Agent file not found")
    expect(out).toContain("{red-fg}")
  })
})
