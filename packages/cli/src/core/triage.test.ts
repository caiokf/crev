import { describe, expect, it } from "vitest"
import { buildTriagePrompt, parseTriageResponse } from "./triage.js"
import type { ReviewIssue } from "./types.js"

const sampleIssue: ReviewIssue = {
  id: "security--xss-1",
  reviewer: "Security",
  runtime: "claude",
  model: "opus",
  file: "src/app.ts",
  line: 42,
  severity: "high",
  category: "security",
  title: "XSS vulnerability",
  description: "User input not sanitized",
  status: "open",
}

describe("buildTriagePrompt", () => {
  it("includes issues, diff, and context", () => {
    const prompt = buildTriagePrompt([sampleIssue], "diff content", "context content", "Triage instructions")
    expect(prompt).toContain("Triage instructions")
    expect(prompt).toContain("context content")
    expect(prompt).toContain("diff content")
    expect(prompt).toContain("security--xss-1")
    expect(prompt).toContain("1 total")
  })

  it("handles empty context", () => {
    const prompt = buildTriagePrompt([sampleIssue], "diff", "", "Instructions")
    expect(prompt).toContain("(No project context files found)")
  })
})

describe("parseTriageResponse", () => {
  it("parses valid triage JSON", () => {
    const json = JSON.stringify({
      triage: [
        { id: "security--xss-1", verdict: "actionable", reasoning: "Real vulnerability" },
        { id: "engineer--1", verdict: "dismissed", reasoning: "Not a real issue" },
      ],
    })
    const verdicts = parseTriageResponse(json)
    expect(verdicts).toHaveLength(2)
    expect(verdicts[0].verdict).toBe("actionable")
    expect(verdicts[1].verdict).toBe("dismissed")
  })

  it("handles embedded JSON in text", () => {
    const raw = `Here is my analysis:\n${JSON.stringify({ triage: [{ id: "1", verdict: "deferred", reasoning: "Later" }] })}\nDone.`
    const verdicts = parseTriageResponse(raw)
    expect(verdicts).toHaveLength(1)
    expect(verdicts[0].verdict).toBe("deferred")
  })

  it("returns empty for non-JSON text", () => {
    expect(parseTriageResponse("no json here")).toEqual([])
  })

  it("returns empty for malformed JSON", () => {
    expect(parseTriageResponse('{"triage": [broken')).toEqual([])
  })

  it("defaults unknown verdicts to actionable", () => {
    const json = JSON.stringify({
      triage: [{ id: "1", verdict: "unknown", reasoning: "test" }],
    })
    const verdicts = parseTriageResponse(json)
    expect(verdicts[0].verdict).toBe("actionable")
  })

  it("filters out entries without id", () => {
    const json = JSON.stringify({
      triage: [
        { verdict: "dismissed", reasoning: "test" },
        { id: "valid", verdict: "actionable", reasoning: "test" },
      ],
    })
    const verdicts = parseTriageResponse(json)
    expect(verdicts).toHaveLength(1)
    expect(verdicts[0].id).toBe("valid")
  })
})
