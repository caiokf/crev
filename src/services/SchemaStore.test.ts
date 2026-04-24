import { describe, expect } from "vitest"
import { it } from "@effect/vitest"
import { Effect, Exit } from "effect"
import fs from "node:fs"
import path from "node:path"
import { withTempDir } from "./test-helpers.js"
import {
  SchemaStore,
  SchemaStoreLive,
  makeTestSchemaStore,
} from "./SchemaStore.js"

const fixtureSchema = (name: string) => `
description: test schema ${name}
reviewers:
  - name: alpha
    runtime: claude
    model: haiku
    prompt: hello
`

describe("SchemaStore service — test layer", () => {
  it.effect("listAll returns injected schema names, sorted", () => {
    const { layer } = makeTestSchemaStore({
      quick: { description: "q", reviewers: [{ name: "a", runtime: "claude", model: "haiku", prompt: "x" }] },
      standard: { description: "s", reviewers: [{ name: "b", runtime: "claude", model: "haiku", prompt: "x" }] },
      custom: { description: "c", reviewers: [{ name: "c", runtime: "claude", model: "haiku", prompt: "x" }] },
    })
    return Effect.gen(function* () {
      const store = yield* SchemaStore
      const names = yield* store.listAll("/ignored")
      expect(names).toEqual(["custom", "quick", "standard"])
    }).pipe(Effect.provide(layer))
  })

  it.effect("resolvePath returns a synthetic path for known schema", () => {
    const { layer } = makeTestSchemaStore({
      quick: { description: "q", reviewers: [{ name: "a", runtime: "claude", model: "haiku", prompt: "x" }] },
    })
    return Effect.gen(function* () {
      const store = yield* SchemaStore
      const p = yield* store.resolvePath("quick", "/test/.crev")
      expect(p).toBe("/test/.crev/schemas/quick.yaml")
    }).pipe(Effect.provide(layer))
  })

  it.effect("resolvePath returns null for unknown schema", () => {
    const { layer } = makeTestSchemaStore({})
    return Effect.gen(function* () {
      const store = yield* SchemaStore
      const p = yield* store.resolvePath("missing", "/test/.crev")
      expect(p).toBeNull()
    }).pipe(Effect.provide(layer))
  })

  it.effect("resolveOrFail fails with SchemaNotFoundError for unknown schema", () => {
    const { layer } = makeTestSchemaStore({})
    return Effect.gen(function* () {
      const store = yield* SchemaStore
      const exit = yield* Effect.exit(store.resolveOrFail("missing", "/test/.crev"))
      expect(Exit.isFailure(exit)).toBe(true)
      if (Exit.isFailure(exit)) {
        const err = exit.cause._tag === "Fail" ? exit.cause.error : null
        expect(err?._tag).toBe("SchemaNotFoundError")
      }
    }).pipe(Effect.provide(layer))
  })

  it.effect("load returns the injected schema by path", () => {
    const { layer } = makeTestSchemaStore({
      quick: {
        description: "hello",
        reviewers: [{ name: "alpha", runtime: "claude", model: "haiku", prompt: "p" }],
      },
    })
    return Effect.gen(function* () {
      const store = yield* SchemaStore
      const schema = yield* store.load("/test/.crev/schemas/quick.yaml")
      expect(schema.description).toBe("hello")
      expect(schema.reviewers[0].name).toBe("alpha")
    }).pipe(Effect.provide(layer))
  })
})

describe("SchemaStore service — Live layer", () => {
  it.effect("listAll reads schemas from .crev/schemas", () =>
    withTempDir((root) =>
      Effect.gen(function* () {
        const schemasDir = path.join(root, ".crev", "schemas")
        fs.mkdirSync(schemasDir, { recursive: true })
        fs.writeFileSync(path.join(schemasDir, "quick.yaml"), fixtureSchema("quick"))
        fs.writeFileSync(path.join(schemasDir, "standard.yaml"), fixtureSchema("standard"))
        // local override — base name should still appear exactly once
        fs.writeFileSync(path.join(schemasDir, "quick.local.yaml"), fixtureSchema("quick.local"))

        const store = yield* SchemaStore
        const names = yield* store.listAll(path.join(root, ".crev"))
        expect(names).toEqual(["quick", "standard"])
      }).pipe(Effect.provide(SchemaStoreLive)),
    ),
  )

  it.effect("resolvePath prefers .local.yaml over .yaml", () =>
    withTempDir((root) =>
      Effect.gen(function* () {
        const schemasDir = path.join(root, ".crev", "schemas")
        fs.mkdirSync(schemasDir, { recursive: true })
        fs.writeFileSync(path.join(schemasDir, "quick.yaml"), fixtureSchema("quick"))
        fs.writeFileSync(path.join(schemasDir, "quick.local.yaml"), fixtureSchema("quick.local"))

        const store = yield* SchemaStore
        const p = yield* store.resolvePath("quick", path.join(root, ".crev"))
        expect(p).toBe(path.join(schemasDir, "quick.local.yaml"))
      }).pipe(Effect.provide(SchemaStoreLive)),
    ),
  )

  it.effect("load surfaces SchemaInvalidError for malformed YAML", () =>
    withTempDir((root) =>
      Effect.gen(function* () {
        const schemasDir = path.join(root, ".crev", "schemas")
        fs.mkdirSync(schemasDir, { recursive: true })
        const bad = path.join(schemasDir, "broken.yaml")
        fs.writeFileSync(bad, "reviewers: [not a valid reviewer\n")

        const store = yield* SchemaStore
        const exit = yield* Effect.exit(store.load(bad))
        expect(Exit.isFailure(exit)).toBe(true)
        if (Exit.isFailure(exit)) {
          const err = exit.cause._tag === "Fail" ? exit.cause.error : null
          expect(err?._tag).toBe("SchemaInvalidError")
        }
      }).pipe(Effect.provide(SchemaStoreLive)),
    ),
  )
})
