import { describe, it, expect } from "vitest"
import { normalizeTitle, titlesAreSimilar, clusterDismissedTitles } from "./stats.js"

describe("normalizeTitle", () => {
  it("strips noise words and sorts remaining", () => {
    expect(normalizeTitle("The command is misleading")).toBe("command misleading")
  })

  it("strips backticks and punctuation", () => {
    expect(normalizeTitle("Command `update` name")).toBe("command name update")
  })

  it("lowercases and deduplicates via sort", () => {
    expect(normalizeTitle("Missing Error Handling")).toBe("error handling missing")
  })

  it("removes single-character words", () => {
    expect(normalizeTitle("a b c debug error")).toBe("debug error")
  })

  it("handles empty string", () => {
    expect(normalizeTitle("")).toBe("")
  })

  it("handles title with only noise words", () => {
    expect(normalizeTitle("the is a an")).toBe("")
  })
})

describe("titlesAreSimilar", () => {
  it("matches identical normalized titles", () => {
    const a = normalizeTitle("Missing error handling")
    const b = normalizeTitle("Missing error handling")
    expect(titlesAreSimilar(a, b)).toBe(true)
  })

  it("matches titles with >50% keyword overlap", () => {
    const a = normalizeTitle("Missing error handling in parser")
    const b = normalizeTitle("No error handling for parser input")
    expect(titlesAreSimilar(a, b)).toBe(true)
  })

  it("rejects titles with low overlap", () => {
    const a = normalizeTitle("SQL injection vulnerability")
    const b = normalizeTitle("Missing error handling")
    expect(titlesAreSimilar(a, b)).toBe(false)
  })

  it("treats empty normalized strings as similar", () => {
    // "".split(" ") yields [""], so union=1 and intersection=1 → similar
    expect(titlesAreSimilar("", "")).toBe(true)
  })
})

describe("clusterDismissedTitles", () => {
  it("clusters identical titles together", () => {
    const titles = ["Missing error handling", "Missing error handling", "SQL injection"]
    const clusters = clusterDismissedTitles(titles)

    expect(clusters[0].representative).toBe("Missing error handling")
    expect(clusters[0].count).toBe(2)
    expect(clusters[1].count).toBe(1)
  })

  it("clusters similar but not identical titles", () => {
    const titles = [
      "Missing error handling in parser",
      "No error handling for parser input",
      "Unrelated security issue",
    ]
    const clusters = clusterDismissedTitles(titles)

    // The two error handling titles should cluster together
    const errorCluster = clusters.find((c) => c.count === 2)
    expect(errorCluster).toBeDefined()
  })

  it("keeps shortest title as representative", () => {
    const titles = [
      "Missing error handling in parser",
      "Missing error handling",
    ]
    const clusters = clusterDismissedTitles(titles)
    expect(clusters[0].representative).toBe("Missing error handling")
    expect(clusters[0].count).toBe(2)
  })

  it("returns empty array for empty input", () => {
    expect(clusterDismissedTitles([])).toEqual([])
  })

  it("sorts by count descending", () => {
    const titles = [
      "SQL injection vulnerability",
      "Missing null check",
      "Missing null check",
      "Unused variable declared",
      "Unused variable declared",
      "Unused variable declared",
    ]
    const clusters = clusterDismissedTitles(titles)
    expect(clusters[0].count).toBe(3)
    expect(clusters[1].count).toBe(2)
    expect(clusters[2].count).toBe(1)
  })
})
