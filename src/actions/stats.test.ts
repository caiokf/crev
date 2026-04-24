import { describe, expect } from "vitest"
import { it } from "@effect/vitest"
import { Effect, Layer } from "effect"
import { statsAction } from "./stats.js"
import { makeTestCrevConfig } from "../services/CrevConfig.js"
import { makeTestReviewStore } from "../services/ReviewStore.js"
import type { ReviewResult } from "../core/types.js"

const review = (
  overrides: Partial<ReviewResult["metadata"]> & { slug: string; timestamp: string },
  reviews: ReviewResult["reviews"] = [],
  triage?: ReviewResult["summary"]["triage"],
): ReviewResult => ({
  metadata: {
    slug: overrides.slug,
    timestamp: overrides.timestamp,
    schema: overrides.schema ?? "quick",
    diffType: overrides.diffType ?? "all",
    schemaHash: overrides.schemaHash,
  },
  reviews,
  summary: { totalIssues: 0, bySeverity: {}, byCategory: {}, byReviewer: {}, triage },
})

const crevDir = "/proj/.crev"
const outputDir = "/proj/.crev/reviews"
const cfg = makeTestCrevConfig({ crevDir, config: { output: { dir: outputDir } } }).layer

describe("statsAction", () => {
  it.effect("returns empty bySchema when no reviews exist", () => {
    const { layer: store } = makeTestReviewStore({})

    return Effect.gen(function* () {
      const out = yield* statsAction({})
      expect(out.totalLoaded).toBe(0)
      expect(out.bySchema).toEqual({})
      expect(out.skippedFiles).toEqual([])
    }).pipe(Effect.provide(Layer.mergeAll(cfg, store)))
  })

  it.effect("groups reviews by schema and aggregates revisions", () => {
    const { layer: store } = makeTestReviewStore({
      [`${outputDir}/a.json`]: review(
        { slug: "a", timestamp: "2024-01-01T00:00:00Z", schema: "quick", schemaHash: "h1" },
        [
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
      ),
      [`${outputDir}/b.json`]: review(
        { slug: "b", timestamp: "2024-02-01T00:00:00Z", schema: "quick", schemaHash: "h1" },
        [
          {
            reviewer: "alpha",
            runtime: "claude",
            model: "haiku",
            durationMs: 2000,
            exitCode: 0,
            rawLength: 0,
            issues: [],
          },
        ],
      ),
    })

    return Effect.gen(function* () {
      const out = yield* statsAction({})
      expect(out.totalLoaded).toBe(2)
      expect(Object.keys(out.bySchema)).toEqual(["quick"])
      const revisions = out.bySchema.quick.revisions
      expect(revisions).toHaveLength(1)
      expect(revisions[0].schemaHash).toBe("h1")
      expect(revisions[0].runs).toBe(2)
      expect(revisions[0].reviewerStats[0].reviewer).toBe("alpha")
      expect(revisions[0].reviewerStats[0].avgDurationMs).toBe(1500)
    }).pipe(Effect.provide(Layer.mergeAll(cfg, store)))
  })

  it.effect("separates reviews into distinct revisions by schemaHash", () => {
    const { layer: store } = makeTestReviewStore({
      [`${outputDir}/a.json`]: review(
        { slug: "a", timestamp: "2024-01-01T00:00:00Z", schema: "quick", schemaHash: "h1" },
      ),
      [`${outputDir}/b.json`]: review(
        { slug: "b", timestamp: "2024-06-01T00:00:00Z", schema: "quick", schemaHash: "h2" },
      ),
    })

    return Effect.gen(function* () {
      const out = yield* statsAction({})
      const revisions = out.bySchema.quick.revisions
      expect(revisions).toHaveLength(2)
      expect(revisions.map((r) => r.schemaHash)).toEqual(["h1", "h2"])
    }).pipe(Effect.provide(Layer.mergeAll(cfg, store)))
  })

  it.effect("filters by schema name when provided", () => {
    const { layer: store } = makeTestReviewStore({
      [`${outputDir}/a.json`]: review(
        { slug: "a", timestamp: "2024-01-01T00:00:00Z", schema: "quick" },
      ),
      [`${outputDir}/b.json`]: review(
        { slug: "b", timestamp: "2024-02-01T00:00:00Z", schema: "security" },
      ),
    })

    return Effect.gen(function* () {
      const out = yield* statsAction({ schema: "security" })
      expect(out.totalLoaded).toBe(2)
      expect(Object.keys(out.bySchema)).toEqual(["security"])
    }).pipe(Effect.provide(Layer.mergeAll(cfg, store)))
  })

  it.effect("returns empty bySchema when schema filter matches nothing", () => {
    const { layer: store } = makeTestReviewStore({
      [`${outputDir}/a.json`]: review(
        { slug: "a", timestamp: "2024-01-01T00:00:00Z", schema: "quick" },
      ),
    })

    return Effect.gen(function* () {
      const out = yield* statsAction({ schema: "missing" })
      expect(out.totalLoaded).toBe(1)
      expect(out.bySchema).toEqual({})
    }).pipe(Effect.provide(Layer.mergeAll(cfg, store)))
  })
})
