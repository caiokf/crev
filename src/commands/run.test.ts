import { describe, expect, it } from "vitest"
import { getModelOverrideReviewerError, getReviewerFilterError } from "./run.js"
import { parseModelOverrides } from "../core/schema.js"

const schema = {
  reviewers: [
    { name: "Engineer", runtime: "claude", model: "sonnet", prompt: "check correctness" },
    { name: "Security", runtime: "claude", model: "opus", prompt: "check security" },
  ],
}

describe("getReviewerFilterError", () => {
  it("returns null when no filter is provided", () => {
    expect(getReviewerFilterError(schema, undefined)).toBeNull()
  })

  it("returns null when filter matches a reviewer (case-insensitive)", () => {
    expect(getReviewerFilterError(schema, ["security"])).toBeNull()
    expect(getReviewerFilterError(schema, [" Security "])).toBeNull()
  })

  it("returns null when filter includes all", () => {
    expect(getReviewerFilterError(schema, ["all"])).toBeNull()
  })

  it("returns helpful error when no reviewers match", () => {
    expect(getReviewerFilterError(schema, ["Nope"]))
      .toBe("No reviewers matched --reviewers. Available reviewers: Engineer, Security")
  })
})

describe("getModelOverrideReviewerError", () => {
  it("returns null when targeted is empty", () => {
    const overrides = parseModelOverrides([])
    expect(getModelOverrideReviewerError(schema, overrides)).toBeNull()
  })

  it("returns null when targeted names match exactly", () => {
    const overrides = parseModelOverrides(["Engineer=claude/opus"])
    expect(getModelOverrideReviewerError(schema, overrides)).toBeNull()
  })

  it("returns null when targeted names match case-insensitively", () => {
    const overrides = parseModelOverrides(["SECURITY=claude/opus"])
    expect(getModelOverrideReviewerError(schema, overrides)).toBeNull()
  })

  it("returns null for blanket-only overrides", () => {
    const overrides = parseModelOverrides(["claude/opus"])
    expect(getModelOverrideReviewerError(schema, overrides)).toBeNull()
  })

  it("returns error when targeted name doesn't match any reviewer", () => {
    const overrides = parseModelOverrides(["Nope=claude/opus"])
    const err = getModelOverrideReviewerError(schema, overrides)
    expect(err).toContain("unknown reviewer")
    expect(err).toContain("nope")
  })

  it("error message lists available reviewers", () => {
    const overrides = parseModelOverrides(["Nope=claude/opus"])
    const err = getModelOverrideReviewerError(schema, overrides)
    expect(err).toContain("Engineer")
    expect(err).toContain("Security")
  })
})
