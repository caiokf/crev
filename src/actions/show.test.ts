import { describe, expect } from "vitest"
import { it } from "@effect/vitest"
import { Effect, Exit, Layer } from "effect"
import path from "node:path"
import { listReviewsAction, showAction } from "./show.js"
import { makeTestCrevConfig } from "../services/CrevConfig.js"
import { makeTestReviewStore } from "../services/ReviewStore.js"
import type { ReviewResult } from "../core/types.js"
import { extractFailError } from "../util/cli-errors.js"

const fixture = (slug: string, timestamp: string): ReviewResult => ({
  metadata: { slug, timestamp, schema: "quick", diffType: "all" },
  reviews: [],
  summary: { totalIssues: 0, bySeverity: {}, byCategory: {}, byReviewer: {} },
})

describe("showAction", () => {
  it.effect("loads a specific file when filePath is provided", () => {
    const cfg = makeTestCrevConfig({ crevDir: "/proj/.crev", config: {} }).layer
    const { layer: store } = makeTestReviewStore({
      "/custom/report.json": fixture("custom", "2024-06-01T00:00:00Z"),
    })

    return Effect.gen(function* () {
      const out = yield* showAction({ filePath: "/custom/report.json" })
      expect(out.filePath).toBe("/custom/report.json")
      expect(out.result.metadata.slug).toBe("custom")
      expect(out.isLatest).toBe(false)
    }).pipe(Effect.provide(Layer.mergeAll(cfg, store)))
  })

  it.effect("falls back to the latest review when no filePath is given", () => {
    const crevDir = "/proj/.crev"
    const cfg = makeTestCrevConfig({
      crevDir,
      config: { output: { dir: "/proj/.crev/reviews" } },
    }).layer
    const { layer: store } = makeTestReviewStore({
      "/proj/.crev/reviews/a.json": fixture("early", "2024-01-01T00:00:00Z"),
      "/proj/.crev/reviews/b.json": fixture("newest", "2024-06-01T00:00:00Z"),
    })

    return Effect.gen(function* () {
      const out = yield* showAction({})
      expect(out.filePath).toBe("/proj/.crev/reviews/b.json")
      expect(out.result.metadata.slug).toBe("newest")
      expect(out.isLatest).toBe(true)
    }).pipe(Effect.provide(Layer.mergeAll(cfg, store)))
  })

  it.effect("fails with ReviewNotFoundError when no reviews exist", () => {
    const cfg = makeTestCrevConfig({
      crevDir: "/proj/.crev",
      config: { output: { dir: "/proj/.crev/reviews" } },
    }).layer
    const { layer: store } = makeTestReviewStore({})

    return Effect.gen(function* () {
      const exit = yield* Effect.exit(showAction({}))
      expect(Exit.isFailure(exit)).toBe(true)
      if (Exit.isFailure(exit)) {
        const err = extractFailError(exit)
        expect(err?._tag).toBe("ReviewNotFoundError")
      }
    }).pipe(Effect.provide(Layer.mergeAll(cfg, store)))
  })

  it.effect("lists every review newest-first via listReviewsAction", () => {
    const crevDir = "/proj/.crev"
    const cfg = makeTestCrevConfig({
      crevDir,
      config: { output: { dir: "/proj/.crev/reviews" } },
    }).layer
    const { layer: store } = makeTestReviewStore({
      "/proj/.crev/reviews/a.json": fixture("early", "2024-01-01T00:00:00Z"),
      "/proj/.crev/reviews/b.json": fixture("newest", "2024-06-01T00:00:00Z"),
    })

    return Effect.gen(function* () {
      const out = yield* listReviewsAction
      expect(out.map((r) => r.slug)).toEqual(["newest", "early"])
      expect(out[0]!.totalIssues).toBe(0)
      expect(out[0]!.reviewers).toBe(0)
    }).pipe(Effect.provide(Layer.mergeAll(cfg, store)))
  })

  it.effect("resolves a relative filePath against the current working directory", () => {
    const cfg = makeTestCrevConfig({ crevDir: "/proj/.crev", config: {} }).layer
    const absolute = path.resolve("reports/latest.json")
    const { layer: store } = makeTestReviewStore({
      [absolute]: fixture("relative", "2024-07-01T00:00:00Z"),
    })

    return Effect.gen(function* () {
      const out = yield* showAction({ filePath: "reports/latest.json" })
      expect(out.filePath).toBe(absolute)
      expect(out.result.metadata.slug).toBe("relative")
    }).pipe(Effect.provide(Layer.mergeAll(cfg, store)))
  })
})
