import { describe, expect } from "vitest"
import { it } from "@effect/vitest"
import { Effect } from "effect"
import fs from "node:fs"
import path from "node:path"
import { CrevConfig, CrevConfigLive, makeTestCrevConfig } from "./CrevConfig.js"
import { withTempDir } from "./test-helpers.js"

describe("CrevConfig service — test layer", () => {
  it.effect("load returns the injected config", () => {
    const { layer } = makeTestCrevConfig({
      crevDir: "/proj/.crev",
      config: {
        defaults: { schema: "standard", type: "all", base: "main" },
      },
    })
    return Effect.gen(function* () {
      const cfg = yield* CrevConfig
      const out = yield* cfg.load()
      expect(out.crevDir).toBe("/proj/.crev")
      expect(out.config.defaults.schema).toBe("standard")
    }).pipe(Effect.provide(layer))
  })

  it.effect("loadAnnotated returns the injected provenance", () => {
    const { layer } = makeTestCrevConfig({
      crevDir: "/proj/.crev",
      config: { defaults: { schema: "quick" } },
      provenance: { "defaults.schema": ".crev/config.yaml" },
    })
    return Effect.gen(function* () {
      const cfg = yield* CrevConfig
      const out = yield* cfg.loadAnnotated()
      expect(out.provenance["defaults.schema"]).toBe(".crev/config.yaml")
    }).pipe(Effect.provide(layer))
  })

  it.effect("findCrevDir returns the injected crevDir", () =>
    Effect.gen(function* () {
      const cfg = yield* CrevConfig
      const dir = yield* cfg.findCrevDir()
      expect(dir).toBe("/proj/.crev")
    }).pipe(
      Effect.provide(
        makeTestCrevConfig({ crevDir: "/proj/.crev", config: {} }).layer,
      ),
    ),
  )
})

describe("CrevConfig service — Live layer", () => {
  it.effect("findCrevDir locates .crev upward from a seeded temp dir", () =>
    withTempDir((root) =>
      Effect.gen(function* () {
        fs.mkdirSync(path.join(root, ".crev"), { recursive: true })
        const nested = path.join(root, "a", "b")
        fs.mkdirSync(nested, { recursive: true })

        const cfg = yield* CrevConfig
        const dir = yield* cfg.findCrevDir(nested)
        expect(dir).toBe(path.join(root, ".crev"))
      }).pipe(Effect.provide(CrevConfigLive)),
    ),
  )

  it.effect("load parses a real layered config from disk", () =>
    withTempDir((root) =>
      Effect.gen(function* () {
        const crevDir = path.join(root, ".crev")
        fs.mkdirSync(crevDir, { recursive: true })
        fs.writeFileSync(
          path.join(crevDir, "config.yaml"),
          "defaults:\n  schema: standard\n  base: develop\n",
        )

        const cfg = yield* CrevConfig
        const out = yield* cfg.load(crevDir)
        expect(out.crevDir).toBe(crevDir)
        expect(out.config.defaults.schema).toBe("standard")
        expect(out.config.defaults.base).toBe("develop")
      }).pipe(Effect.provide(CrevConfigLive)),
    ),
  )
})
