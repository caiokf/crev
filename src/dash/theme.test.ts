import { describe, expect, it } from "vitest"
import { DASH_COLORS, escapeTags } from "./theme.js"

describe("DASH_COLORS", () => {
  it("exposes semantic colour names used by blessed tag formatting", () => {
    // Regression guard: views like run-detail build `{${DASH_COLORS.ok}-fg}…`
    // strings. If one of these keys is renamed or removed, colouring
    // silently disappears across the dash.
    expect(DASH_COLORS.ok).toBe("green")
    expect(DASH_COLORS.warn).toBe("yellow")
    expect(DASH_COLORS.danger).toBe("red")
    expect(DASH_COLORS.accent).toBe("cyan")
    expect(DASH_COLORS.muted).toBe("gray")
  })
})

describe("escapeTags", () => {
  it("returns the input unchanged when no blessed-tag chars are present", () => {
    expect(escapeTags("hello world")).toBe("hello world")
  })

  it("escapes { and } so blessed cannot interpret user text as tags", () => {
    expect(escapeTags("{red-fg}evil{/red-fg}")).toBe("{open}red-fg{close}evil{open}/red-fg{close}")
  })

  it("escapes stray braces inside code snippets", () => {
    expect(escapeTags("obj = { a: 1 }")).toBe("obj = {open} a: 1 {close}")
  })

  it("is idempotent for already-escaped input (round-trip produces more escapes, not breakage)", () => {
    const once = escapeTags("{x}")
    const twice = escapeTags(once)
    expect(twice).not.toContain("{x}")
    expect(twice).toContain("{open}")
  })
})
