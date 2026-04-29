import { describe, expect } from "vitest"
import { it } from "@effect/vitest"
import { Effect, Exit, Layer } from "effect"
import fs from "node:fs"
import path from "node:path"
import { showSchemaAction, validateSchemaAction } from "./schema.js"
import { makeTestCrevConfig } from "../services/CrevConfig.js"
import { makeTestSchemaStore } from "../services/SchemaStore.js"
import { withTempDir } from "../services/test-helpers.js"
import type { SchemaFileType } from "../core/schema.js"
import { extractFailError } from "../util/cli-errors.js"

const fixtureSchema = (): SchemaFileType => ({
  description: "Quick checks",
  reviewers: [
    {
      name: "Engineer",
      runtime: "claude",
      model: "sonnet",
      prompt: "Review the code.",
    },
  ],
})

const crevDir = "/proj/.crev"
const cfg = makeTestCrevConfig({ crevDir, config: {} }).layer

describe("showSchemaAction", () => {
  it.effect("returns name, resolved path, and parsed schema", () => {
    const { layer: store } = makeTestSchemaStore({ quick: fixtureSchema() })

    return Effect.gen(function* () {
      const detail = yield* showSchemaAction("quick")
      expect(detail.name).toBe("quick")
      expect(detail.path).toBe(path.join(crevDir, "schemas", "quick.yaml"))
      expect(detail.description).toBe("Quick checks")
      expect(detail.reviewers).toHaveLength(1)
    }).pipe(Effect.provide(Layer.mergeAll(cfg, store)))
  })

  it.effect("fails with SchemaNotFoundError for an unknown schema", () => {
    const { layer: store } = makeTestSchemaStore({})

    return Effect.gen(function* () {
      const exit = yield* Effect.exit(showSchemaAction("missing"))
      expect(Exit.isFailure(exit)).toBe(true)
      if (Exit.isFailure(exit)) {
        const err = extractFailError(exit)
        expect(err?._tag).toBe("SchemaNotFoundError")
      }
    }).pipe(Effect.provide(Layer.mergeAll(cfg, store)))
  })
})

describe("validateSchemaAction", () => {
  it.effect("reports File not found for a missing explicit file", () => {
    const { layer: store } = makeTestSchemaStore({})

    return Effect.gen(function* () {
      const results = yield* validateSchemaAction({ file: "/tmp/does-not-exist.yaml" })
      expect(results).toHaveLength(1)
      expect(results[0].valid).toBe(false)
      expect(results[0].errors[0]).toContain("File not found")
    }).pipe(Effect.provide(Layer.mergeAll(cfg, store)))
  })

  it.effect("validates a real YAML schema on disk", () =>
    withTempDir((root) =>
      Effect.gen(function* () {
        const schemaPath = path.join(root, "quick.yaml")
        fs.writeFileSync(
          schemaPath,
          [
            "description: Quick checks",
            "reviewers:",
            "  - name: Engineer",
            "    runtime: claude",
            "    model: sonnet",
            "    prompt: Review the code.",
          ].join("\n"),
        )
        const { layer: store } = makeTestSchemaStore({})
        const results = yield* validateSchemaAction({ file: schemaPath }).pipe(
          Effect.provide(Layer.mergeAll(cfg, store)),
        )
        expect(results).toHaveLength(1)
        expect(results[0].valid).toBe(true)
        expect(results[0].errors).toEqual([])
      }),
    ),
  )

  it.effect("reports parse errors for malformed YAML", () =>
    withTempDir((root) =>
      Effect.gen(function* () {
        const schemaPath = path.join(root, "broken.yaml")
        fs.writeFileSync(schemaPath, "reviewers: [not closed")
        const { layer: store } = makeTestSchemaStore({})
        const results = yield* validateSchemaAction({ file: schemaPath }).pipe(
          Effect.provide(Layer.mergeAll(cfg, store)),
        )
        expect(results).toHaveLength(1)
        expect(results[0].valid).toBe(false)
        expect(results[0].errors.length).toBeGreaterThan(0)
      }),
    ),
  )
})
