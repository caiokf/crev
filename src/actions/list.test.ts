import { describe, expect } from "vitest"
import { it } from "@effect/vitest"
import { Effect, Layer } from "effect"
import { listRuntimesAction, listSchemasAction } from "./list.js"
import { makeTestCrevConfig } from "../services/CrevConfig.js"
import { SchemaStore, makeTestSchemaStore } from "../services/SchemaStore.js"

describe("listSchemasAction", () => {
  it.effect("returns name/description/reviewer count for each schema", () => {
    const cfg = makeTestCrevConfig({ crevDir: "/test/.crev", config: {} }).layer
    const schemas = makeTestSchemaStore({
      quick: {
        description: "Fast review",
        reviewers: [
          { name: "a", runtime: "claude", model: "haiku", prompt: "x" },
          { name: "b", runtime: "claude", model: "haiku", prompt: "x" },
        ],
      },
      standard: {
        description: "Full review",
        reviewers: [{ name: "c", runtime: "claude", model: "haiku", prompt: "x" }],
      },
    }).layer

    return Effect.gen(function* () {
      const summaries = yield* listSchemasAction
      expect(summaries).toEqual([
        { name: "quick", description: "Fast review", reviewers: 2 },
        { name: "standard", description: "Full review", reviewers: 1 },
      ])
    }).pipe(Effect.provide(Layer.mergeAll(cfg, schemas)))
  })

  it.effect("tolerates schemas that fail to resolve and reports them", () => {
    const cfg = makeTestCrevConfig({ crevDir: "/test/.crev", config: {} }).layer

    // Custom SchemaStore: listAll returns two names, only one resolves.
    const store = Layer.succeed(
      SchemaStore,
      SchemaStore.of({
        listAll: () => Effect.succeed(["good", "bad"]),
        resolvePath: (name: string) =>
          Effect.succeed(name === "good" ? "/s/good.yaml" : null),
        resolveOrFail: () => Effect.die("unused in test"),
        load: () =>
          Effect.succeed({
            description: "ok",
            reviewers: [
              { name: "a", runtime: "claude" as const, model: "haiku", prompt: "x" },
            ],
          }),
      }),
    )

    return Effect.gen(function* () {
      const summaries = yield* listSchemasAction
      expect(summaries).toEqual([
        { name: "good", description: "ok", reviewers: 1 },
        { name: "bad", description: "not found", reviewers: 0, error: "unresolved path" },
      ])
    }).pipe(Effect.provide(Layer.mergeAll(cfg, store)))
  })
})

describe("listRuntimesAction", () => {
  it.effect("returns runtime metadata from the valet registry", () =>
    Effect.gen(function* () {
      const runtimes = yield* listRuntimesAction
      expect(Array.isArray(runtimes)).toBe(true)
      const claude = runtimes.find((r) => r.name === "claude")
      expect(claude).toBeDefined()
      if (claude) {
        expect(typeof claude.type).toBe("string")
        expect(Array.isArray(claude.models)).toBe(true)
        expect(claude.models.length).toBeGreaterThan(0)
        expect(typeof claude.defaultModel).toBe("string")
      }
    }),
  )
})
