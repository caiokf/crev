import { describe, expect, it } from "vitest"
import { formatRow } from "./schemas-list.js"
import { renderSchema } from "./schema-detail.js"
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

describe("schema detail · renderSchema", () => {
  const detail: SchemaDetail = {
    name: "quick",
    path: "/repo/.crev/schemas/quick.yaml",
    description: "fast check",
    reviewers: [
      { name: "Engineer", runtime: "claude", model: "sonnet", prompt: "review" },
      { name: "Security", runtime: "claude", model: "opus", agent: "security.md" },
    ],
  }

  it("renders name, description, relative path, and reviewers", () => {
    const out = renderSchema(detail, "/repo/.crev")
    expect(out).toContain("quick")
    expect(out).toContain("fast check")
    expect(out).toContain("source: schemas/quick.yaml")
    expect(out).toContain("Reviewers")
    expect(out).toContain("Engineer")
    expect(out).toContain("claude/sonnet")
    expect(out).toContain("(inline prompt)")
    expect(out).toContain("security.md")
  })

  it("renders triage block when present", () => {
    const out = renderSchema(
      {
        ...detail,
        triage: { enabled: true, runtime: "claude", model: "sonnet" },
      },
      "/repo/.crev",
    )
    expect(out).toContain("Triage")
    expect(out).toContain("runtime: claude/sonnet")
  })

  it("omits triage block when not configured", () => {
    const out = renderSchema(detail, "/repo/.crev")
    expect(out).not.toContain("Triage")
  })
})
