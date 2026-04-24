import { describe, expect, it } from "vitest"
import { ENTRIES } from "./home.js"

describe("home · ENTRIES", () => {
  it("assigns a unique single-letter shortcut to every entry", () => {
    const keys = ENTRIES.map((e) => e.key)
    expect(new Set(keys).size).toBe(keys.length)
    for (const k of keys) expect(k).toMatch(/^[a-z]$/)
  })

  it("avoids colliding with globally-reserved keys (q/escape/backspace)", () => {
    // `q` is the global quit key — binding it on the home list would
    // hijack quit and leave the user stranded.
    const keys = ENTRIES.map((e) => e.key)
    expect(keys).not.toContain("q")
  })
})
