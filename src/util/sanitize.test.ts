import { describe, expect, it } from "vitest"
import { sanitizeVersion, sanitizeDetail } from "./sanitize.js"

describe("sanitizeVersion", () => {
  it("extracts a clean semver from a noisy banner", () => {
    const raw = "Some CLI v2.3.1\nHook info\nASCII art"
    expect(sanitizeVersion(raw)).toBe("2.3.1")
  })

  it("extracts semver with a prerelease suffix", () => {
    expect(sanitizeVersion("version 1.0.0-beta.3 ready")).toBe("1.0.0-beta.3")
  })

  it("extracts semver with a build suffix", () => {
    expect(sanitizeVersion("tool 4.2.0-rc.1")).toBe("4.2.0-rc.1")
  })

  it("falls back to the first printable line when no semver found", () => {
    expect(sanitizeVersion("some CLI tool")).toBe("some CLI tool")
  })

  it("truncates long first-line fallbacks to 20 chars", () => {
    const long = "a".repeat(50)
    expect(sanitizeVersion(long)).toBe("a".repeat(20))
  })

  it("returns em-dash for null/undefined/empty input", () => {
    expect(sanitizeVersion(null)).toBe("–")
    expect(sanitizeVersion(undefined)).toBe("–")
    expect(sanitizeVersion("")).toBe("–")
  })

  it("strips ANSI escape codes before extracting", () => {
    expect(sanitizeVersion("\x1B[32m1.2.3\x1B[0m")).toBe("1.2.3")
  })

  it("strips control characters but keeps line breaks for splitting", () => {
    expect(sanitizeVersion("\x00\x01garbage\n3.0.0")).toBe("3.0.0")
  })

  it("returns em-dash when only control characters remain", () => {
    expect(sanitizeVersion("\x00\x01\x02")).toBe("–")
  })
})

describe("sanitizeDetail", () => {
  it("returns the first line of a multi-line string", () => {
    expect(sanitizeDetail("first line\nsecond line\nthird")).toBe("first line")
  })

  it("trims whitespace from the first line", () => {
    expect(sanitizeDetail("  padded  \nrest")).toBe("padded")
  })

  it("strips ANSI escapes", () => {
    expect(sanitizeDetail("\x1B[1mbolded\x1B[0m")).toBe("bolded")
  })

  it("strips control characters", () => {
    expect(sanitizeDetail("\x00hello\x7F")).toBe("hello")
  })

  it("returns em-dash for an empty string", () => {
    expect(sanitizeDetail("")).toBe("–")
  })

  it("returns em-dash when string is only whitespace", () => {
    expect(sanitizeDetail("   \n   ")).toBe("–")
  })
})
