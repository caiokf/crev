import { describe, expect } from "vitest"
import { it } from "@effect/vitest"
import { Effect } from "effect"
import { Logger, makeTestLogger } from "./Logger.js"

describe("Logger service", () => {
  it.effect("test layer records messages in order with their level", () => {
    const { layer, messages } = makeTestLogger()

    return Effect.gen(function* () {
      const logger = yield* Logger
      yield* logger.info("hello")
      yield* logger.warn("careful")
      yield* logger.error("boom")
      yield* logger.debug("internal")

      expect(messages).toEqual([
        { level: "info", msg: "hello" },
        { level: "warn", msg: "careful" },
        { level: "error", msg: "boom" },
        { level: "debug", msg: "internal" },
      ])
    }).pipe(Effect.provide(layer))
  })

  it.effect("silent layer is a no-op", () => {
    return Effect.gen(function* () {
      const logger = yield* Logger
      yield* logger.info("nobody hears")
      yield* logger.error("nobody hears either")
      // no assertion — test passes if nothing throws
    }).pipe(Effect.provide(makeTestLogger().layer))
  })
})
