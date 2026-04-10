import { describe, expect, it } from "vitest"
import { VALID_MODELS } from "../core/schema.js"

describe("help command content", () => {
  it("VALID_MODELS contains all expected runtimes", () => {
    expect(Object.keys(VALID_MODELS)).toEqual(
      expect.arrayContaining(["claude", "codex", "gemini", "kimi", "coderabbit", "opencode"]),
    )
  })

  it("each runtime has at least one model", () => {
    for (const [runtime, models] of Object.entries(VALID_MODELS)) {
      expect(models.length, `${runtime} should have models`).toBeGreaterThan(0)
    }
  })
})
