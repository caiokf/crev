import { describe, expect } from "vitest"
import { it } from "@effect/vitest"
import { Effect } from "effect"
import { listConfigLayersAction, showConfigAction } from "./config.js"
import { makeTestCrevConfig } from "../services/CrevConfig.js"

describe("showConfigAction", () => {
  it.effect("returns the merged config and provenance", () => {
    const { layer } = makeTestCrevConfig({
      crevDir: "/proj/.crev",
      config: { output: { dir: "/proj/.crev/reviews" } },
      provenance: { "output.dir": "project" },
    })

    return Effect.gen(function* () {
      const out = yield* showConfigAction
      expect(out.crevDir).toBe("/proj/.crev")
      expect(out.config.output.dir).toBe("/proj/.crev/reviews")
      expect(out.provenance["output.dir"]).toBe("project")
    }).pipe(Effect.provide(layer))
  })
})

describe("listConfigLayersAction", () => {
  it.effect("enumerates config layer paths under the crev dir", () => {
    const { layer } = makeTestCrevConfig({ crevDir: "/proj/.crev", config: {} })

    return Effect.gen(function* () {
      const layers = yield* listConfigLayersAction
      expect(layers.length).toBeGreaterThan(0)
      // Layers are files inside /proj/.crev or the user config dir —
      // none of those exist in the test env so `exists` should all be false.
      expect(layers.some((l) => l.path.includes("/proj/.crev"))).toBe(true)
      for (const l of layers) {
        expect(l.exists).toBe(false)
      }
    }).pipe(Effect.provide(layer))
  })
})
