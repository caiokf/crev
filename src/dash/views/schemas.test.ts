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
  renderStats,
} from "./schema-detail.js"
import type { SchemaDetail } from "../../actions/schema.js"
import type { RevisionGroup } from "../../actions/stats.js"

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

describe("schema detail · renderStats", () => {
  const makeRev = (overrides: Partial<RevisionGroup> = {}): RevisionGroup => ({
    schemaHash: "abc123",
    runs: 3,
    firstDate: "2026-04-10T10:00:00Z",
    lastDate: "2026-04-20T10:00:00Z",
    reviewerStats: [],
    recurringDismissed: [],
    hasTriage: true,
    ...overrides,
  })

  const makeReviewerStat = (overrides: Partial<import("../../actions/stats.js").ReviewerStats> = {}): import("../../actions/stats.js").ReviewerStats => ({
    reviewer: "Engineer",
    runtime: "claude",
    model: "sonnet",
    runs: 3,
    totalIssues: 12,
    avgDurationMs: 45000,
    actionable: 4,
    deferred: 3,
    dismissed: 5,
    untriaged: 0,
    byCategory: { bug: 6, style: 6 },
    bySeverity: { medium: 8, low: 4 },
    ...overrides,
  })

  it("shows run count and date range", () => {
    const out = renderStats(makeRev())
    expect(out).toContain("stats")
    expect(out).toContain("3 runs")
    expect(out).toContain("Apr 10")
    expect(out).toContain("Apr 20")
  })

  it("singularises 1 run", () => {
    const out = renderStats(makeRev({ runs: 1, firstDate: "2026-04-10T10:00:00Z", lastDate: "2026-04-10T10:00:00Z" }))
    expect(out).toContain("1 run")
    expect(out).not.toContain("1 runs")
  })

  it("shows same date when first and last match", () => {
    const out = renderStats(makeRev({ firstDate: "2026-04-10T10:00:00Z", lastDate: "2026-04-10T10:00:00Z" }))
    expect(out).toContain("Apr 10")
    expect(out).not.toContain("→")
  })

  it("renders reviewer stats with triage percentages", () => {
    const out = renderStats(makeRev({ reviewerStats: [makeReviewerStat()] }))
    expect(out).toContain("Engineer")
    expect(out).toContain("12 issues")
    expect(out).toContain("33% act")
    expect(out).toContain("42% dis")
    expect(out).toContain("45s")
  })

  it("renders reviewer stats without triage when hasTriage is false", () => {
    const stat = makeReviewerStat({ runs: 2, totalIssues: 10, avgDurationMs: 30000 })
    const out = renderStats(makeRev({ hasTriage: false, reviewerStats: [stat] }))
    expect(out).toContain("Engineer")
    expect(out).toContain("10 issues")
    expect(out).toContain("5.0/run")
    expect(out).toContain("30s")
    expect(out).not.toContain("act")
    expect(out).not.toContain("dis")
  })
})

describe("schema detail · renderSchemaMeta with stats", () => {
  const detail: SchemaDetail = {
    name: "quick",
    path: "/repo/.crev/schemas/quick.yaml",
    description: "fast check",
    reviewers: [
      { name: "Engineer", runtime: "claude", model: "sonnet", prompt: "review" },
    ],
  }

  it("appends stats section when revision is provided", () => {
    const rev: RevisionGroup = {
      schemaHash: "abc",
      runs: 2,
      firstDate: "2026-04-15T10:00:00Z",
      lastDate: "2026-04-15T10:00:00Z",
      reviewerStats: [],
      recurringDismissed: [],
      hasTriage: false,
    }
    const out = renderSchemaMeta(detail, "/repo/.crev", rev)
    expect(out).toContain("stats")
    expect(out).toContain("2 runs")
  })

  it("does not show stats section before stats are loaded", () => {
    const out = renderSchemaMeta(detail, "/repo/.crev")
    expect(out).not.toContain("stats")
  })

  it("shows 'no runs yet' when stats loaded but no reviews exist", () => {
    const out = renderSchemaMeta(detail, "/repo/.crev", null)
    expect(out).toContain("stats")
    expect(out).toContain("no runs yet")
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
