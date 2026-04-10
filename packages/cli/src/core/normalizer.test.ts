import { describe, expect, it, vi } from "vitest"
import { prefixId, tryParseIssues } from "./normalizer.js"

describe("tryParseIssues", () => {
  it("parses valid JSON with issues array", () => {
    const json = JSON.stringify({
      issues: [
        {
          id: "xss-1",
          file: "src/app.ts",
          line: 42,
          severity: "high",
          category: "security",
          title: "XSS vulnerability",
          description: "User input not sanitized",
        },
      ],
    })
    const issues = tryParseIssues(json, "Security", "claude", "opus")
    expect(issues).toHaveLength(1)
    expect(issues[0].id).toBe("security--xss-1")
    expect(issues[0].reviewer).toBe("Security")
    expect(issues[0].severity).toBe("high")
    expect(issues[0].category).toBe("security")
  })

  it("handles JSON embedded in other text", () => {
    const raw = `Here is my review:
\`\`\`json
{"issues": [{"id": "1", "title": "Bug", "severity": "low", "category": "bug", "description": "test"}]}
\`\`\`
Done!`
    const issues = tryParseIssues(raw, "Engineer", "claude", "sonnet")
    expect(issues).toHaveLength(1)
    expect(issues[0].title).toBe("Bug")
  })

  it("returns empty array for non-JSON text", () => {
    const issues = tryParseIssues("This is just text with no JSON", "Test", "claude", "sonnet")
    expect(issues).toHaveLength(0)
  })

  it("returns empty array for empty string", () => {
    const issues = tryParseIssues("", "Test", "claude", "sonnet")
    expect(issues).toHaveLength(0)
  })

  it("returns empty array for malformed JSON", () => {
    const issues = tryParseIssues('{"issues": [broken}', "Test", "claude", "sonnet")
    expect(issues).toHaveLength(0)
  })

  it("normalizes unknown severity to medium", () => {
    const json = JSON.stringify({
      issues: [{ id: "1", title: "Test", severity: "extreme", category: "bug", description: "" }],
    })
    const issues = tryParseIssues(json, "Test", "claude", "sonnet")
    expect(issues[0].severity).toBe("medium")
  })

  it("normalizes unknown category to bug", () => {
    const json = JSON.stringify({
      issues: [{ id: "1", title: "Test", severity: "low", category: "unknown", description: "" }],
    })
    const issues = tryParseIssues(json, "Test", "claude", "sonnet")
    expect(issues[0].category).toBe("bug")
  })

  it("assigns sequential IDs when none provided", () => {
    const json = JSON.stringify({
      issues: [
        { title: "First", severity: "low", category: "bug", description: "" },
        { title: "Second", severity: "low", category: "bug", description: "" },
      ],
    })
    const issues = tryParseIssues(json, "Engineer", "claude", "sonnet")
    expect(issues[0].id).toBe("engineer--1")
    expect(issues[1].id).toBe("engineer--2")
  })

  it("sets status to open", () => {
    const json = JSON.stringify({
      issues: [{ id: "1", title: "Test", severity: "low", category: "bug", description: "" }],
    })
    const issues = tryParseIssues(json, "Test", "claude", "sonnet")
    expect(issues[0].status).toBe("open")
  })
})

describe("prefixId", () => {
  it("prefixes id with reviewer name", () => {
    expect(prefixId("xss-1", "Security")).toBe("security--xss-1")
  })

  it("does not double-prefix", () => {
    expect(prefixId("security--xss-1", "Security")).toBe("security--xss-1")
  })

  it("normalizes reviewer name", () => {
    expect(prefixId("1", "Security Analyst")).toBe("security-analyst--1")
  })
})
