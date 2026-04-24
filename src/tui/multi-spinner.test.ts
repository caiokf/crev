import { describe, expect, it } from "vitest"
import { formatIssueSummary } from "./multi-spinner.js"

// Strip ANSI escape codes so colour-agnostic assertions survive chalk's
// dynamic style selection on different terminals.
const plain = (s: string) =>
  // eslint-disable-next-line no-control-regex
  s.replace(/\x1B\[[0-9;]*m/g, "")

describe("formatIssueSummary", () => {
  it("says 'no issues' for a zero count", () => {
    expect(plain(formatIssueSummary(0))).toBe("no issues")
  })

  it("singularises the word for exactly one issue", () => {
    expect(plain(formatIssueSummary(1))).toBe("1 issue")
  })

  it("pluralises for two issues", () => {
    expect(plain(formatIssueSummary(2))).toBe("2 issues")
  })

  it("pluralises for larger counts too", () => {
    expect(plain(formatIssueSummary(7))).toBe("7 issues")
    expect(plain(formatIssueSummary(100))).toBe("100 issues")
  })
})
