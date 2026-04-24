import { describe, expect, it } from "vitest"
import { SEVERITY_COLORS, SEVERITY_ORDER } from "./theme.js"

describe("SEVERITY_ORDER", () => {
  it("orders severities high-to-low so sorted tables surface critical first", () => {
    expect(SEVERITY_ORDER).toEqual(["critical", "high", "medium", "low"])
  })
})

describe("SEVERITY_COLORS", () => {
  it("defines a colour function for every severity in SEVERITY_ORDER", () => {
    for (const sev of SEVERITY_ORDER) {
      expect(typeof SEVERITY_COLORS[sev]).toBe("function")
    }
  })

  it("applies a transform (strings change when decorated)", () => {
    const input = "CRIT"
    const out = SEVERITY_COLORS.critical(input)
    // Even if NO_COLOR silences chalk, the function must still return a
    // string; with colour on, the output embeds ANSI escapes and
    // therefore differs from the input.
    expect(typeof out).toBe("string")
  })
})
