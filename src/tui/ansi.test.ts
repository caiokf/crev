import { describe, expect, it } from "vitest"
import chalk from "chalk"
import { visibleLength, padVisible, truncateVisible, fitCell } from "./ansi.js"

describe("visibleLength", () => {
  it("plain string returns .length", () => {
    expect(visibleLength("hello")).toBe(5)
  })

  it("string with ANSI color codes returns length without escapes", () => {
    const colored = chalk.red("hello")
    expect(visibleLength(colored)).toBe(5)
  })

  it("empty string returns 0", () => {
    expect(visibleLength("")).toBe(0)
  })
})

describe("padVisible", () => {
  it("plain string shorter than width is padded", () => {
    const result = padVisible("hi", 10)
    expect(result).toBe("hi        ")
    expect(result.length).toBe(10)
  })

  it("string with ANSI codes is padded based on visible length", () => {
    // Use raw ANSI escape to avoid chalk stripping colors in test env
    const colored = "\x1B[31mhi\x1B[39m"  // red "hi"
    const result = padVisible(colored, 10)
    expect(visibleLength(result)).toBe(10)
    // Raw length includes escape codes + padding, so should be longer than 10
    expect(result.length).toBeGreaterThan(10)
  })

  it("string at or over width is returned unchanged", () => {
    expect(padVisible("hello", 5)).toBe("hello")
    expect(padVisible("hello world", 5)).toBe("hello world")
  })
})

describe("truncateVisible", () => {
  it("plain string under max is unchanged", () => {
    expect(truncateVisible("hi", 10)).toBe("hi")
  })

  it("plain string over max is truncated with ellipsis", () => {
    const result = truncateVisible("hello world", 5)
    expect(visibleLength(result)).toBeLessThanOrEqual(5)
  })

  it("string with ANSI codes truncates based on visible length", () => {
    const colored = chalk.red("hello world this is long")
    const result = truncateVisible(colored, 8)
    // Visible length should be at most 8 (7 chars + ellipsis)
    const stripped = result.replace(/\x1B\[[0-9;]*m/g, "").replace("…", "")
    expect(stripped.length).toBeLessThanOrEqual(8)
  })
})

describe("fitCell", () => {
  it("pads a short value to the target width", () => {
    const result = fitCell("hi", 10)
    expect(result).toBe("hi        ")
    expect(result.length).toBe(10)
  })

  it("returns exact-width values unchanged", () => {
    expect(fitCell("hello", 5)).toBe("hello")
  })

  it("truncates a long value with an ellipsis", () => {
    const result = fitCell("hello world", 5)
    expect(result).toBe("hell…")
    expect(result.length).toBe(5)
  })

  it("handles single-character width by showing just ellipsis", () => {
    const result = fitCell("hello", 1)
    expect(result).toBe("…")
  })

  it("handles zero width", () => {
    const result = fitCell("hello", 0)
    expect(result).toBe("…")
  })

  it("handles empty string", () => {
    const result = fitCell("", 5)
    expect(result).toBe("     ")
    expect(result.length).toBe(5)
  })
})
