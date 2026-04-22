import { describe, expect, it } from "vitest"
import { uniqueSuffix } from "./paths.js"

describe("uniqueSuffix", () => {
  it("returns a 6-character hex string", () => {
    const suffix = uniqueSuffix()
    expect(suffix).toMatch(/^[0-9a-f]{6}$/)
  })

  it("generates different values on consecutive calls", () => {
    const suffixes = new Set(Array.from({ length: 20 }, () => uniqueSuffix()))
    expect(suffixes.size).toBe(20)
  })
})
