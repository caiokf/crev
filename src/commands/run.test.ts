import { describe, expect, it } from "vitest"
import { getReviewerFilterError } from "./run.js"

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
