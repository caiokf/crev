import { describe, it, expect } from "vitest"
import { extractJsonObject } from "./json-extract.js"

describe("extractJsonObject", () => {
  it("extracts a simple JSON object with the target key", () => {
    const raw = '{"issues": [{"id": "1"}]}'
    const result = extractJsonObject(raw, "issues")
    expect(JSON.parse(result!)).toEqual({ issues: [{ id: "1" }] })
  })

  it("extracts JSON embedded in preamble text", () => {
    const raw = 'Here is my review:\n\n{"issues": [{"id": "1", "title": "Bug"}]}'
    const result = extractJsonObject(raw, "issues")
    expect(JSON.parse(result!).issues).toHaveLength(1)
  })

  it("handles preamble text containing curly braces", () => {
    const raw = 'The function foo() { return 1; } has issues.\n{"issues": [{"id": "1"}]}'
    const result = extractJsonObject(raw, "issues")
    expect(JSON.parse(result!).issues).toHaveLength(1)
  })

  it("handles nested JSON objects", () => {
    const raw = '{"triage": [{"id": "1", "verdict": "actionable", "meta": {"score": 0.9}}]}'
    const result = extractJsonObject(raw, "triage")
    const parsed = JSON.parse(result!)
    expect(parsed.triage[0].meta.score).toBe(0.9)
  })

  it("handles escaped quotes inside strings", () => {
    const raw = '{"issues": [{"id": "1", "title": "Fix \\"bug\\" in parser"}]}'
    const result = extractJsonObject(raw, "issues")
    const parsed = JSON.parse(result!)
    expect(parsed.issues[0].title).toBe('Fix "bug" in parser')
  })

  it("returns null when key is not present", () => {
    const raw = '{"data": [1, 2, 3]}'
    expect(extractJsonObject(raw, "issues")).toBeNull()
  })

  it("returns null for empty input", () => {
    expect(extractJsonObject("", "issues")).toBeNull()
  })

  it("returns null for plain text with no JSON", () => {
    expect(extractJsonObject("No issues found in this code.", "issues")).toBeNull()
  })

  it("returns null for truncated JSON", () => {
    const raw = '{"issues": [{"id": "1"'
    expect(extractJsonObject(raw, "issues")).toBeNull()
  })

  it("selects the correct object when multiple JSON objects exist", () => {
    const raw = '{"meta": "info"}\n\n{"issues": [{"id": "2"}]}'
    const result = extractJsonObject(raw, "issues")
    const parsed = JSON.parse(result!)
    expect(parsed.issues[0].id).toBe("2")
  })

  it("handles JSON with trailing text", () => {
    const raw = '{"triage": [{"id": "1", "verdict": "dismissed"}]}\n\nLet me know if you need more.'
    const result = extractJsonObject(raw, "triage")
    expect(JSON.parse(result!).triage).toHaveLength(1)
  })

  it("handles deeply nested braces in values", () => {
    const raw = '{"issues": [{"id": "1", "description": "Use obj = {a: {b: 1}} instead"}]}'
    const result = extractJsonObject(raw, "issues")
    expect(JSON.parse(result!).issues[0].id).toBe("1")
  })

  it("handles markdown code fence wrapping JSON", () => {
    const raw = 'Here are the results:\n```json\n{"issues": [{"id": "1"}]}\n```'
    const result = extractJsonObject(raw, "issues")
    expect(JSON.parse(result!).issues).toHaveLength(1)
  })
})
