import { Effect } from "effect"
import { describe, expect, it } from "vitest"
import { runDashEffect } from "./runtime.js"

describe("runDashEffect", () => {
  it("returns ok with the value when the effect succeeds", async () => {
    const effect = Effect.succeed(42)
    const result = await runDashEffect(effect)
    expect(result).toEqual({ kind: "ok", value: 42 })
  })

  it("returns error with the .message when the effect fails via an Error", async () => {
    const effect = Effect.fail(new Error("boom"))
    const result = await runDashEffect(effect)
    expect(result.kind).toBe("error")
    if (result.kind === "error") {
      expect(result.message).toContain("boom")
    }
  })

  it("coerces non-Error failures to strings so views always get a message", async () => {
    const effect = Effect.fail("plain string failure")
    const result = await runDashEffect(effect)
    expect(result.kind).toBe("error")
    if (result.kind === "error") {
      expect(result.message).toContain("plain string failure")
    }
  })

  it("captures synchronous defects (thrown non-failures) as error results", async () => {
    const effect = Effect.sync(() => {
      throw new Error("defect")
    })
    const result = await runDashEffect(effect)
    expect(result.kind).toBe("error")
    if (result.kind === "error") {
      expect(result.message).toContain("defect")
    }
  })
})
