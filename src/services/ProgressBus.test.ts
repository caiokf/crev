import { describe, expect } from "vitest"
import { it } from "@effect/vitest"
import { Effect, Stream } from "effect"
import { makeTestProgressBus, ProgressBus, ProgressBusLive, ProgressBusSilent } from "./ProgressBus.js"

describe("ProgressBus test layer", () => {
  it.effect("captures every published event in order", () => {
    const { layer, events } = makeTestProgressBus()

    return Effect.gen(function* () {
      const bus = yield* ProgressBus
      yield* bus.publish({ kind: "run-started", schema: "quick", reviewerCount: 2 })
      yield* bus.publish({
        kind: "reviewer-started",
        name: "Engineer",
        runtime: "claude",
        model: "sonnet",
      })
      yield* bus.publish({ kind: "run-completed", durationMs: 1234 })

      expect(events()).toEqual([
        { kind: "run-started", schema: "quick", reviewerCount: 2 },
        { kind: "reviewer-started", name: "Engineer", runtime: "claude", model: "sonnet" },
        { kind: "run-completed", durationMs: 1234 },
      ])
    }).pipe(Effect.provide(layer))
  })
})

describe("ProgressBusSilent layer", () => {
  it.effect("accepts publishes without error and yields an empty stream", () =>
    Effect.gen(function* () {
      const bus = yield* ProgressBus
      yield* bus.publish({ kind: "run-started", schema: "q", reviewerCount: 0 })
      const collected = yield* Stream.runCollect(bus.subscribe())
      expect([...collected]).toEqual([])
    }).pipe(Effect.provide(ProgressBusSilent)),
  )
})

describe("ProgressBusLive layer", () => {
  it.effect("accepts publishes without subscribers (no-op fan-out)", () =>
    Effect.gen(function* () {
      // With no subscribers, a bounded PubSub drops events after
      // filling; we just want to confirm publishing doesn't hang or
      // throw. Full subscriber semantics are covered by Effect's own
      // PubSub tests and by our test layer.
      const bus = yield* ProgressBus
      yield* bus.publish({ kind: "run-started", schema: "q", reviewerCount: 1 })
      yield* bus.publish({ kind: "run-completed", durationMs: 5 })
    }).pipe(Effect.provide(ProgressBusLive)),
  )
})
