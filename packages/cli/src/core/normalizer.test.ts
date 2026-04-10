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
    const result = tryParseIssues(json, "Security", "claude", "opus")
    expect(result.parsed).toBe(true)
    if (result.parsed) {
      expect(result.issues).toHaveLength(1)
      expect(result.issues[0].id).toBe("security--xss-1")
      expect(result.issues[0].reviewer).toBe("Security")
      expect(result.issues[0].severity).toBe("high")
      expect(result.issues[0].category).toBe("security")
    }
  })

  it("handles JSON embedded in other text", () => {
    const raw = `Here is my review:
\`\`\`json
{"issues": [{"id": "1", "title": "Bug", "severity": "low", "category": "bug", "description": "test"}]}
\`\`\`
Done!`
    const result = tryParseIssues(raw, "Engineer", "claude", "sonnet")
    expect(result.parsed).toBe(true)
    if (result.parsed) {
      expect(result.issues).toHaveLength(1)
      expect(result.issues[0].title).toBe("Bug")
    }
  })

  it("returns parsed:false for non-JSON text", () => {
    const result = tryParseIssues("This is just text with no JSON", "Test", "claude", "sonnet")
    expect(result.parsed).toBe(false)
  })

  it("returns parsed:false for empty string", () => {
    const result = tryParseIssues("", "Test", "claude", "sonnet")
    expect(result.parsed).toBe(false)
  })

  it("returns parsed:false for malformed JSON", () => {
    const result = tryParseIssues('{"issues": [broken}', "Test", "claude", "sonnet")
    expect(result.parsed).toBe(false)
  })

  it("returns parsed:true with empty array for valid JSON with no issues", () => {
    const json = '{"issues": []}'
    const result = tryParseIssues(json, "Test", "claude", "sonnet")
    expect(result.parsed).toBe(true)
    if (result.parsed) {
      expect(result.issues).toHaveLength(0)
    }
  })

  it("normalizes unknown severity to medium", () => {
    const json = JSON.stringify({
      issues: [{ id: "1", title: "Test", severity: "extreme", category: "bug", description: "" }],
    })
    const result = tryParseIssues(json, "Test", "claude", "sonnet")
    expect(result.parsed).toBe(true)
    if (result.parsed) {
      expect(result.issues[0].severity).toBe("medium")
    }
  })

  it("normalizes unknown category to bug", () => {
    const json = JSON.stringify({
      issues: [{ id: "1", title: "Test", severity: "low", category: "unknown", description: "" }],
    })
    const result = tryParseIssues(json, "Test", "claude", "sonnet")
    expect(result.parsed).toBe(true)
    if (result.parsed) {
      expect(result.issues[0].category).toBe("bug")
    }
  })

  it("assigns sequential IDs when none provided", () => {
    const json = JSON.stringify({
      issues: [
        { title: "First", severity: "low", category: "bug", description: "" },
        { title: "Second", severity: "low", category: "bug", description: "" },
      ],
    })
    const result = tryParseIssues(json, "Engineer", "claude", "sonnet")
    expect(result.parsed).toBe(true)
    if (result.parsed) {
      expect(result.issues[0].id).toBe("engineer--1")
      expect(result.issues[1].id).toBe("engineer--2")
    }
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
