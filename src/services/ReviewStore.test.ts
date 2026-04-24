import { describe, expect } from "vitest"
import { it } from "@effect/vitest"
import { Effect, Exit, Layer, TestClock, TestContext } from "effect"
import fs from "node:fs"
import path from "node:path"
import { withTempDir } from "./test-helpers.js"
import { FileSystemLive } from "./FileSystem.js"
import {
  ReviewStore,
  ReviewStoreLive,
  makeTestReviewStore,
} from "./ReviewStore.js"
import type { ReviewResult } from "../core/types.js"

const fixtureReview = (slug: string, timestamp: string): ReviewResult => ({
  metadata: {
    slug,
    timestamp,
    schema: "quick",
    diffType: "all",
  },
  reviews: [
    {
      reviewer: "alpha",
      runtime: "claude",
      model: "haiku",
      durationMs: 1000,
      exitCode: 0,
      rawLength: 0,
      issues: [],
    },
  ],
  summary: {
    totalIssues: 0,
    bySeverity: {},
    byCategory: {},
    byReviewer: {},
  },
})

describe("ReviewStore service — test layer", () => {
  it.effect("list returns seeded reviews in timestamp order", () => {
    const a = fixtureReview("a", "2024-01-01T00:00:00Z")
    const b = fixtureReview("b", "2024-02-01T00:00:00Z")
    const { layer } = makeTestReviewStore({
      "/out/a.json": a,
      "/out/b.json": b,
    })
    return Effect.gen(function* () {
      const store = yield* ReviewStore
      const { reviews, skipped } = yield* store.list("/out")
      expect(reviews.map((r) => r.metadata.slug)).toEqual(["a", "b"])
      expect(skipped).toEqual([])
    }).pipe(Effect.provide(layer))
  })

  it.effect("latest returns the review with the most recent timestamp", () => {
    const a = fixtureReview("a", "2024-01-01T00:00:00Z")
    const b = fixtureReview("b", "2024-06-01T00:00:00Z")
    const { layer } = makeTestReviewStore({
      "/out/a.json": a,
      "/out/b.json": b,
    })
    return Effect.gen(function* () {
      const store = yield* ReviewStore
      const result = yield* store.latest("/out")
      expect(result.metadata.slug).toBe("b")
    }).pipe(Effect.provide(layer))
  })

  it.effect("latest fails with ReviewNotFoundError when empty", () => {
    const { layer } = makeTestReviewStore({})
    return Effect.gen(function* () {
      const store = yield* ReviewStore
      const exit = yield* Effect.exit(store.latest("/out"))
      expect(Exit.isFailure(exit)).toBe(true)
      if (Exit.isFailure(exit)) {
        const err = exit.cause._tag === "Fail" ? exit.cause.error : null
        expect(err?._tag).toBe("ReviewNotFoundError")
      }
    }).pipe(Effect.provide(layer))
  })

  it.effect("write persists a review and returns the JSON path", () => {
    const { layer, files } = makeTestReviewStore({})
    const result = fixtureReview("main", "2024-04-24T10:00:00Z")

    return Effect.gen(function* () {
      const store = yield* ReviewStore
      const paths = yield* store.write({
        result,
        outputDir: "/out",
        slug: "main",
        format: "json",
        timestamp: new Date(2024, 3, 24, 10, 0, 0),
        suffix: "a1b2c3",
      })
      expect(paths.jsonPath).toBe("/out/2024-04-24-1000-main-a1b2c3.json")
      expect(paths.markdownPath).toBeUndefined()
      expect(files.has("/out/2024-04-24-1000-main-a1b2c3.json")).toBe(true)
    }).pipe(Effect.provide(layer))
  })

  it.effect("write with format=both also produces a markdown path", () => {
    const { layer, files } = makeTestReviewStore({})
    const result = fixtureReview("main", "2024-04-24T10:00:00Z")

    return Effect.gen(function* () {
      const store = yield* ReviewStore
      const paths = yield* store.write({
        result,
        outputDir: "/out",
        slug: "main",
        format: "both",
        timestamp: new Date(2024, 3, 24, 10, 0, 0),
        suffix: "a1b2c3",
      })
      expect(paths.jsonPath).toBe("/out/2024-04-24-1000-main-a1b2c3.json")
      expect(paths.markdownPath).toBe("/out/2024-04-24-1000-main-a1b2c3.md")
      expect(files.has("/out/2024-04-24-1000-main-a1b2c3.md")).toBe(true)
    }).pipe(Effect.provide(layer))
  })
})

describe("ReviewStore service — Live layer", () => {
  const layer = Layer.provide(ReviewStoreLive, FileSystemLive)

  it.effect("list reads real JSON reviews from disk and skips invalid ones", () =>
    withTempDir((root) =>
      Effect.gen(function* () {
        const outDir = path.join(root, "reviews")
        fs.mkdirSync(outDir, { recursive: true })

        fs.writeFileSync(
          path.join(outDir, "good.json"),
          JSON.stringify(fixtureReview("good", "2024-01-01T00:00:00Z")),
        )
        fs.writeFileSync(path.join(outDir, "broken.json"), "{not json")

        const store = yield* ReviewStore
        const { reviews, skipped } = yield* store.list(outDir)
        expect(reviews).toHaveLength(1)
        expect(reviews[0].metadata.slug).toBe("good")
        expect(skipped).toHaveLength(1)
        expect(skipped[0]).toContain("broken.json")
      }).pipe(Effect.provide(layer)),
    ),
  )

  it.effect("write roundtrips through the real filesystem", () =>
    withTempDir((root) =>
      Effect.gen(function* () {
        const outDir = path.join(root, "reviews")
        const result = fixtureReview("roundtrip", "2024-04-24T10:00:00Z")

        const store = yield* ReviewStore
        const paths = yield* store.write({
          result,
          outputDir: outDir,
          slug: "roundtrip",
          format: "json",
          timestamp: new Date(2024, 3, 24, 10, 0, 0),
          suffix: "zzzzzz",
        })

        expect(paths.jsonPath).toBe(path.join(outDir, "2024-04-24-1000-roundtrip-zzzzzz.json"))
        expect(fs.existsSync(paths.jsonPath)).toBe(true)

        const parsed = JSON.parse(fs.readFileSync(paths.jsonPath, "utf-8"))
        expect(parsed.metadata.slug).toBe("roundtrip")
      }).pipe(Effect.provide(layer)),
    ),
  )
})

// Suppress unused-import warnings for the Effect TestClock/TestContext imports
// reserved for upcoming timestamp-from-Clock tests.
void TestClock
void TestContext
