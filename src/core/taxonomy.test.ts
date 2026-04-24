import { describe, expect, it } from "vitest"
import {
  DEFAULT_MODEL,
  MAX_DIFF_CHARS,
  MAX_RAW_CHARS,
  REVIEW_CATEGORIES,
  REVIEW_CATEGORY_SET,
  REVIEW_SEVERITIES,
  REVIEW_SEVERITY_SET,
  TRIAGE_VERDICTS,
  TRIAGE_VERDICT_SET,
} from "./taxonomy.js"

describe("taxonomy", () => {
  it("exposes severities ordered low → critical", () => {
    expect(REVIEW_SEVERITIES).toEqual(["low", "medium", "high", "critical"])
  })

  it("exposes the canonical review categories", () => {
    expect(REVIEW_CATEGORIES).toEqual([
      "bug",
      "security",
      "performance",
      "style",
      "compliance",
      "architecture",
    ])
  })

  it("exposes the canonical triage verdicts", () => {
    expect(TRIAGE_VERDICTS).toEqual(["actionable", "deferred", "dismissed"])
  })

  it("keeps the sets in sync with their source arrays", () => {
    expect([...REVIEW_SEVERITY_SET].sort()).toEqual([...REVIEW_SEVERITIES].sort())
    expect([...REVIEW_CATEGORY_SET].sort()).toEqual([...REVIEW_CATEGORIES].sort())
    expect([...TRIAGE_VERDICT_SET].sort()).toEqual([...TRIAGE_VERDICTS].sort())
  })

  it("exposes sensible prompt-length caps and a DEFAULT_MODEL sentinel", () => {
    expect(MAX_RAW_CHARS).toBeGreaterThanOrEqual(50_000)
    expect(MAX_DIFF_CHARS).toBeGreaterThanOrEqual(50_000)
    expect(DEFAULT_MODEL).toBe("default")
  })
})
