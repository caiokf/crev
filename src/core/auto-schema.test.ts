import { describe, expect, it } from "vitest"
import { buildSelectionPrompt, parseSelectionResponse, parseShortstat } from "./auto-schema.js"
import type { SchemaCandidate } from "./auto-schema.js"

const candidates: SchemaCandidate[] = [
  { name: "quick", description: "Fast single-reviewer check for small changes (1 reviewers: Engineer)" },
  { name: "standard", description: "Balanced review covering correctness, security, and design (3 reviewers: Engineer, Security, Architect)" },
  { name: "thorough", description: "Comprehensive multi-perspective review for critical changes (6 reviewers: Engineer, Security, Architect, Performance, Testing, Documentation)" },
]

describe("parseShortstat", () => {
  it("parses standard shortstat output", () => {
    const stat = " 3 files changed, 42 insertions(+), 10 deletions(-)"
    expect(parseShortstat(stat)).toEqual({
      filesChanged: 3,
      insertions: 42,
      deletions: 10,
    })
  })

  it("handles insertions only", () => {
    const stat = " 1 file changed, 5 insertions(+)"
    expect(parseShortstat(stat)).toEqual({
      filesChanged: 1,
      insertions: 5,
      deletions: 0,
    })
  })

  it("handles deletions only", () => {
    const stat = " 2 files changed, 8 deletions(-)"
    expect(parseShortstat(stat)).toEqual({
      filesChanged: 2,
      insertions: 0,
      deletions: 8,
    })
  })

  it("returns zeros for empty string", () => {
    expect(parseShortstat("")).toEqual({
      filesChanged: 0,
      insertions: 0,
      deletions: 0,
    })
  })
})

describe("buildSelectionPrompt", () => {
  it("includes schema descriptions and diff stats", () => {
    const prompt = buildSelectionPrompt(candidates, { filesChanged: 5, insertions: 100, deletions: 20 }, false)
    expect(prompt).toContain('"quick"')
    expect(prompt).toContain('"standard"')
    expect(prompt).toContain('"thorough"')
    expect(prompt).toContain("5 files changed")
    expect(prompt).toContain("100 insertions")
    expect(prompt).toContain("20 deletions")
  })

  it("uses analyze context when analyze is true", () => {
    const prompt = buildSelectionPrompt(candidates, null, true)
    expect(prompt).toContain("full codebase analysis")
    expect(prompt).not.toContain("files changed")
  })

  it("handles null stats gracefully", () => {
    const prompt = buildSelectionPrompt(candidates, null, false)
    expect(prompt).toContain("Diff stats unavailable")
  })

  it("handles schemas with no description", () => {
    const noDesc = [{ name: "custom", description: "" }]
    const prompt = buildSelectionPrompt(noDesc, null, false)
    expect(prompt).toContain("(no description)")
  })
})

describe("parseSelectionResponse", () => {
  it("parses valid JSON response", () => {
    const raw = JSON.stringify({ schema: "standard", reasoning: "Moderate change size" })
    const result = parseSelectionResponse(raw, candidates)
    expect(result.schema).toBe("standard")
    expect(result.reasoning).toBe("Moderate change size")
  })

  it("parses JSON embedded in text", () => {
    const raw = `I recommend:\n${JSON.stringify({ schema: "thorough", reasoning: "Large change" })}\nThat's my pick.`
    const result = parseSelectionResponse(raw, candidates)
    expect(result.schema).toBe("thorough")
  })

  it("rejects schema name not in candidates", () => {
    const raw = JSON.stringify({ schema: "nonexistent", reasoning: "test" })
    const result = parseSelectionResponse(raw, candidates)
    expect(result.schema).toBe("quick") // fallback to first
  })

  it("falls back to first candidate on malformed JSON", () => {
    const result = parseSelectionResponse("not json at all", candidates)
    expect(result.schema).toBe("quick")
    expect(result.reasoning).toContain("Could not parse")
  })

  it("falls back to first candidate on empty response", () => {
    const result = parseSelectionResponse("", candidates)
    expect(result.schema).toBe("quick")
  })

  it("handles missing reasoning field", () => {
    const raw = JSON.stringify({ schema: "standard" })
    const result = parseSelectionResponse(raw, candidates)
    expect(result.schema).toBe("standard")
    expect(result.reasoning).toBe("")
  })
})
