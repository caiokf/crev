import { describe, expect, it } from "vitest"
import { buildTriagePrompt, parseTriageResponse, applyTriageVerdicts } from "./triage.js"
import type { RawTriageVerdict } from "./triage.js"
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
}

const sampleIssue2: ReviewIssue = {
  id: "engineer--xss-dup",
  reviewer: "Engineer",
  runtime: "claude",
  model: "sonnet",
  file: "src/app.ts",
  line: 42,
  severity: "medium",
  category: "bug",
  title: "Unsanitized user input",
  description: "Input is not escaped before rendering",
}

const sampleIssue3: ReviewIssue = {
  id: "engineer--perf-1",
  reviewer: "Engineer",
  runtime: "claude",
  model: "sonnet",
  file: "src/db.ts",
  line: 100,
  severity: "low",
  category: "style",
  title: "N+1 query pattern",
  description: "Loop issues individual queries",
}

const noFlags = { deduplicate: false, recategorize: false }

describe("buildTriagePrompt", () => {
  it("includes issues, diff, and instructions", () => {
    const prompt = buildTriagePrompt([sampleIssue], "diff content", "Triage instructions")
    expect(prompt).toContain("Triage instructions")
    expect(prompt).toContain("diff content")
    expect(prompt).toContain("security--xss-1")
    expect(prompt).toContain("1 total")
  })

  it("uses analyze scope text when diffType is analyze", () => {
    const prompt = buildTriagePrompt([sampleIssue], "diff", "Instructions", "analyze")
    expect(prompt).toContain("full codebase analysis")
    expect(prompt).not.toContain("```diff")
  })

  it("includes dedup section when deduplicate flag is set", () => {
    const prompt = buildTriagePrompt([sampleIssue], "diff", "Instructions", undefined, {
      deduplicate: true,
      recategorize: false,
    })
    expect(prompt).toContain("## Deduplication")
    expect(prompt).toContain("duplicateOf")
    expect(prompt).not.toContain("## Re-categorization")
    expect(prompt).not.toContain("correctedSeverity")
  })

  it("includes recategorize section when recategorize flag is set", () => {
    const prompt = buildTriagePrompt([sampleIssue], "diff", "Instructions", undefined, {
      deduplicate: false,
      recategorize: true,
    })
    expect(prompt).toContain("## Re-categorization")
    expect(prompt).toContain("correctedSeverity")
    expect(prompt).toContain("correctedCategory")
    expect(prompt).not.toContain("## Deduplication")
  })

  it("includes both sections when both flags are set", () => {
    const prompt = buildTriagePrompt([sampleIssue], "diff", "Instructions", undefined, {
      deduplicate: true,
      recategorize: true,
    })
    expect(prompt).toContain("## Deduplication")
    expect(prompt).toContain("## Re-categorization")
    expect(prompt).toContain("duplicateOf")
    expect(prompt).toContain("correctedSeverity")
  })

  it("omits extra sections when no flags are set", () => {
    const prompt = buildTriagePrompt([sampleIssue], "diff", "Instructions", undefined, noFlags)
    expect(prompt).not.toContain("## Deduplication")
    expect(prompt).not.toContain("## Re-categorization")
    expect(prompt).not.toContain("duplicateOf")
    expect(prompt).not.toContain("correctedSeverity")
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

  it("parses duplicateOf field", () => {
    const json = JSON.stringify({
      triage: [{ id: "dup-1", verdict: "dismissed", reasoning: "Same issue", duplicateOf: "original-1" }],
    })
    const verdicts = parseTriageResponse(json)
    expect(verdicts[0].duplicateOf).toBe("original-1")
  })

  it("parses correctedSeverity and correctedCategory", () => {
    const json = JSON.stringify({
      triage: [{
        id: "issue-1",
        verdict: "actionable",
        reasoning: "Real but miscategorized",
        correctedSeverity: "critical",
        correctedCategory: "security",
      }],
    })
    const verdicts = parseTriageResponse(json)
    expect(verdicts[0].correctedSeverity).toBe("critical")
    expect(verdicts[0].correctedCategory).toBe("security")
  })

  it("omits optional fields when not present", () => {
    const json = JSON.stringify({
      triage: [{ id: "1", verdict: "actionable", reasoning: "ok" }],
    })
    const verdicts = parseTriageResponse(json)
    expect(verdicts[0].duplicateOf).toBeUndefined()
    expect(verdicts[0].correctedSeverity).toBeUndefined()
    expect(verdicts[0].correctedCategory).toBeUndefined()
  })
})

describe("applyTriageVerdicts", () => {
  it("applies basic verdicts without flags", () => {
    const verdicts: RawTriageVerdict[] = [
      { id: "security--xss-1", verdict: "actionable", reasoning: "Real issue" },
    ]
    const result = applyTriageVerdicts([sampleIssue], verdicts, noFlags)
    expect(result[0].triage?.verdict).toBe("actionable")
    expect(result[0].triage?.reasoning).toBe("Real issue")
    expect(result[0].severity).toBe("high") // unchanged
    expect(result[0].category).toBe("security") // unchanged
  })

  it("defaults to actionable when no verdict is returned for an issue", () => {
    const result = applyTriageVerdicts([sampleIssue], [], noFlags)
    expect(result[0].triage?.verdict).toBe("actionable")
    expect(result[0].triage?.reasoning).toContain("No triage verdict")
  })

  it("marks duplicates as dismissed when deduplicate is enabled", () => {
    const verdicts: RawTriageVerdict[] = [
      { id: "security--xss-1", verdict: "actionable", reasoning: "Real issue" },
      { id: "engineer--xss-dup", verdict: "actionable", reasoning: "Same as xss-1", duplicateOf: "security--xss-1" },
    ]
    const result = applyTriageVerdicts([sampleIssue, sampleIssue2], verdicts, {
      deduplicate: true,
      recategorize: false,
    })
    expect(result[0].triage?.verdict).toBe("actionable")
    expect(result[1].triage?.verdict).toBe("dismissed")
    expect(result[1].triage?.reasoning).toContain("Duplicate of security--xss-1")
  })

  it("ignores duplicateOf when deduplicate is disabled", () => {
    const verdicts: RawTriageVerdict[] = [
      { id: "security--xss-1", verdict: "actionable", reasoning: "Real issue" },
      { id: "engineer--xss-dup", verdict: "actionable", reasoning: "Also real", duplicateOf: "security--xss-1" },
    ]
    const result = applyTriageVerdicts([sampleIssue, sampleIssue2], verdicts, noFlags)
    expect(result[0].triage?.verdict).toBe("actionable")
    expect(result[1].triage?.verdict).toBe("actionable")
  })

  it("ignores duplicateOf pointing to a non-existent issue", () => {
    const verdicts: RawTriageVerdict[] = [
      { id: "security--xss-1", verdict: "actionable", reasoning: "ok", duplicateOf: "nonexistent-id" },
    ]
    const result = applyTriageVerdicts([sampleIssue], verdicts, {
      deduplicate: true,
      recategorize: false,
    })
    expect(result[0].triage?.verdict).toBe("actionable")
  })

  it("ignores duplicateOf pointing to self", () => {
    const verdicts: RawTriageVerdict[] = [
      { id: "security--xss-1", verdict: "actionable", reasoning: "ok", duplicateOf: "security--xss-1" },
    ]
    const result = applyTriageVerdicts([sampleIssue], verdicts, {
      deduplicate: true,
      recategorize: false,
    })
    expect(result[0].triage?.verdict).toBe("actionable")
  })

  it("applies corrected severity when recategorize is enabled", () => {
    const verdicts: RawTriageVerdict[] = [
      { id: "engineer--perf-1", verdict: "actionable", reasoning: "Real perf issue", correctedSeverity: "high" },
    ]
    const result = applyTriageVerdicts([sampleIssue3], verdicts, {
      deduplicate: false,
      recategorize: true,
    })
    expect(result[0].severity).toBe("high")
    expect(result[0].category).toBe("style") // unchanged
  })

  it("applies corrected category when recategorize is enabled", () => {
    const verdicts: RawTriageVerdict[] = [
      { id: "engineer--perf-1", verdict: "actionable", reasoning: "Miscategorized", correctedCategory: "performance" },
    ]
    const result = applyTriageVerdicts([sampleIssue3], verdicts, {
      deduplicate: false,
      recategorize: true,
    })
    expect(result[0].category).toBe("performance")
    expect(result[0].severity).toBe("low") // unchanged
  })

  it("ignores corrected fields when recategorize is disabled", () => {
    const verdicts: RawTriageVerdict[] = [
      { id: "engineer--perf-1", verdict: "actionable", reasoning: "ok", correctedSeverity: "critical", correctedCategory: "security" },
    ]
    const result = applyTriageVerdicts([sampleIssue3], verdicts, noFlags)
    expect(result[0].severity).toBe("low") // unchanged
    expect(result[0].category).toBe("style") // unchanged
  })

  it("rejects invalid corrected severity", () => {
    const verdicts: RawTriageVerdict[] = [
      { id: "engineer--perf-1", verdict: "actionable", reasoning: "ok", correctedSeverity: "super-critical" },
    ]
    const result = applyTriageVerdicts([sampleIssue3], verdicts, {
      deduplicate: false,
      recategorize: true,
    })
    expect(result[0].severity).toBe("low") // unchanged, invalid value rejected
  })

  it("rejects invalid corrected category", () => {
    const verdicts: RawTriageVerdict[] = [
      { id: "engineer--perf-1", verdict: "actionable", reasoning: "ok", correctedCategory: "ux-design" },
    ]
    const result = applyTriageVerdicts([sampleIssue3], verdicts, {
      deduplicate: false,
      recategorize: true,
    })
    expect(result[0].category).toBe("style") // unchanged, invalid value rejected
  })

  it("applies both dedup and recategorize together", () => {
    const verdicts: RawTriageVerdict[] = [
      { id: "security--xss-1", verdict: "actionable", reasoning: "Real", correctedSeverity: "critical" },
      { id: "engineer--xss-dup", verdict: "actionable", reasoning: "Dup", duplicateOf: "security--xss-1" },
      { id: "engineer--perf-1", verdict: "actionable", reasoning: "Miscategorized", correctedCategory: "performance" },
    ]
    const result = applyTriageVerdicts([sampleIssue, sampleIssue2, sampleIssue3], verdicts, {
      deduplicate: true,
      recategorize: true,
    })
    expect(result[0].severity).toBe("critical") // recategorized
    expect(result[0].triage?.verdict).toBe("actionable")
    expect(result[1].triage?.verdict).toBe("dismissed") // deduped
    expect(result[2].category).toBe("performance") // recategorized
  })
})
