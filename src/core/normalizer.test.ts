import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { prefixId, reviewerIdPrefix, tryParseIssues, normalizeOutput } from "./normalizer.js"
import type { Config } from "./config.js"

const valetMocks = vi.hoisted(() => ({
  getRuntime: vi.fn(),
}))

vi.mock("@caiokf/valet", () => ({
  getRuntime: valetMocks.getRuntime,
}))

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
      expect(result.issues[0].id).toBe(`${reviewerIdPrefix("Security")}--xss-1`)
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

  it("defaults missing status to open", () => {
    const json = JSON.stringify({
      issues: [{ id: "1", title: "Test", severity: "low", category: "bug", description: "" }],
    })
    const result = tryParseIssues(json, "Test", "claude", "sonnet")
    expect(result.parsed).toBe(true)
    if (result.parsed) {
      expect(result.issues[0].status).toBe("open")
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
      expect(result.issues[0].id).toBe(`${reviewerIdPrefix("Engineer")}--1`)
      expect(result.issues[1].id).toBe(`${reviewerIdPrefix("Engineer")}--2`)
    }
  })
})

describe("prefixId", () => {
  it("prefixes id with reviewer slug + hash tag", () => {
    const prefix = reviewerIdPrefix("Security")
    expect(prefixId("xss-1", "Security")).toBe(`${prefix}--xss-1`)
    expect(prefix).toMatch(/^security-[0-9a-f]{4}$/)
  })

  it("does not double-prefix", () => {
    const prefix = reviewerIdPrefix("Security")
    expect(prefixId(`${prefix}--xss-1`, "Security")).toBe(`${prefix}--xss-1`)
  })

  it("slugifies reviewer name in the prefix", () => {
    const prefix = reviewerIdPrefix("Security Analyst")
    expect(prefix).toMatch(/^security-analyst-[0-9a-f]{4}$/)
    expect(prefixId("1", "Security Analyst")).toBe(`${prefix}--1`)
  })

  it("produces distinct prefixes for reviewer names that slugify the same", () => {
    // "A/B" and "A B" both slugify to "a-b" — the hash tag keeps them apart.
    const slashPrefix = reviewerIdPrefix("A/B")
    const spacePrefix = reviewerIdPrefix("A B")
    expect(slashPrefix).not.toBe(spacePrefix)
    expect(prefixId("1", "A/B")).not.toBe(prefixId("1", "A B"))
  })
})

describe("reviewerIdPrefix", () => {
  it("is deterministic for the same reviewer name", () => {
    expect(reviewerIdPrefix("Security")).toBe(reviewerIdPrefix("Security"))
  })

  it("differs when reviewer names differ, even after slugification", () => {
    expect(reviewerIdPrefix("A/B")).not.toBe(reviewerIdPrefix("A.B"))
    expect(reviewerIdPrefix("A/B")).not.toBe(reviewerIdPrefix("A-B"))
  })
})

describe("normalizeOutput", () => {
  const baseConfig = {
    defaults: { schema: "quick", type: "all", base: "main" },
    runtimes: {},
    aliases: {},
    diff: { exclude: [] },
    output: { dir: ".crev/reviews", format: "json" },
    normalizer: { enabled: true, runtime: "claude", model: "haiku" },
    failback: {},
    triage: {
      enabled: false,
      runtime: "claude",
      model: "opus",
      deduplicate: false,
      recategorize: false,
      enrichComments: false,
      prompt: "",
    },
  } as Config

  beforeEach(() => {
    vi.resetAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("returns issues directly when raw output is valid JSON", async () => {
    const raw = JSON.stringify({
      issues: [
        { id: "bug-1", title: "Bug", severity: "high", category: "bug", description: "desc" },
      ],
    })
    const result = await normalizeOutput("Test", "claude", "opus", raw, 1000, 0, baseConfig)

    expect(result.issues).toHaveLength(1)
    expect(result.issues[0].id).toBe(`${reviewerIdPrefix("Test")}--bug-1`)
    expect(result.reviewer).toBe("Test")
  })

  it("falls back to normalizer LLM when direct parse fails", async () => {
    valetMocks.getRuntime.mockReturnValue({
      execute: vi.fn().mockResolvedValue({
        raw: JSON.stringify({
          issues: [
            { id: "extracted-1", title: "Extracted", severity: "low", category: "style", description: "found" },
          ],
        }),
        durationMs: 50,
        exitCode: 0,
      }),
    })

    const result = await normalizeOutput("Test", "claude", "opus", "not json at all", 1000, 0, baseConfig)

    expect(result.issues).toHaveLength(1)
    expect(result.issues[0].id).toBe(`${reviewerIdPrefix("Test")}--extracted-1`)
    expect(valetMocks.getRuntime).toHaveBeenCalledWith("claude")
  })

  it("returns empty issues when normalizer is disabled and direct parse fails", async () => {
    const config = { ...baseConfig, normalizer: { ...baseConfig.normalizer, enabled: false } }
    const result = await normalizeOutput("Test", "claude", "opus", "not json", 1000, 0, config)

    expect(result.issues).toEqual([])
    expect(valetMocks.getRuntime).not.toHaveBeenCalled()
  })

  it("returns empty issues when normalizer runtime throws", async () => {
    valetMocks.getRuntime.mockReturnValue({
      execute: vi.fn().mockRejectedValue(new Error("normalizer crashed")),
    })
    const stderrSpy = vi.spyOn(console, "error").mockImplementation(() => {})

    const result = await normalizeOutput("Test", "claude", "opus", "not json", 1000, 0, baseConfig)

    expect(result.issues).toEqual([])
    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining("normalizer crashed"))
  })

  it("returns empty issues when normalizer returns unparseable output", async () => {
    valetMocks.getRuntime.mockReturnValue({
      execute: vi.fn().mockResolvedValue({
        raw: "still not json after normalization",
        durationMs: 50,
        exitCode: 0,
      }),
    })

    const result = await normalizeOutput("Test", "claude", "opus", "not json", 1000, 0, baseConfig)

    expect(result.issues).toEqual([])
  })

  it("preserves metadata fields in all paths", async () => {
    const raw = JSON.stringify({ issues: [] })
    const result = await normalizeOutput("Security", "gemini", "2.5-pro", raw, 5000, 0, baseConfig)

    expect(result.reviewer).toBe("Security")
    expect(result.runtime).toBe("gemini")
    expect(result.model).toBe("2.5-pro")
    expect(result.durationMs).toBe(5000)
    expect(result.exitCode).toBe(0)
    expect(result.rawLength).toBe(raw.length)
  })
})
