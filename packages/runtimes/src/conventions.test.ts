import { describe, expect, it } from "vitest"
import { getAllRuntimes } from "./registry.js"

describe("runtime adapter conventions", () => {
  const runtimes = getAllRuntimes()

  for (const runtime of runtimes) {
    describe(runtime.name, () => {
      it("has a non-empty name", () => {
        expect(runtime.name).toBeTruthy()
      })

      it("has a type of cli or api", () => {
        expect(["cli", "api"]).toContain(runtime.type)
      })

      it("has at least one model", () => {
        expect(runtime.models.length).toBeGreaterThan(0)
      })

      it("has a defaultModel that is in models[]", () => {
        expect(runtime.models).toContain(runtime.defaultModel)
      })

      it("has an execute method", () => {
        expect(typeof runtime.execute).toBe("function")
      })

      it("has a healthCheck method", () => {
        expect(typeof runtime.healthCheck).toBe("function")
      })

      it("has a boolean supportsCustomPrompt", () => {
        expect(typeof runtime.supportsCustomPrompt).toBe("boolean")
      })
    })
  }
})
