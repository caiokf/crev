import { describe, expect } from "vitest"
import { it } from "@effect/vitest"
import { Effect } from "effect"
import { Terminal, makeTestTerminal } from "./Terminal.js"

describe("Terminal service", () => {
  it.effect("test layer captures writes to stdout buffer", () => {
    const { layer, stdout, stderr } = makeTestTerminal()

    return Effect.gen(function* () {
      const term = yield* Terminal
      yield* term.println("hello")
      yield* term.print("no newline")
      yield* term.errln("boom")

      expect(stdout).toEqual(["hello\n", "no newline"])
      expect(stderr).toEqual(["boom\n"])
    }).pipe(Effect.provide(layer))
  })

  it.effect("test layer starts with empty buffers", () => {
    const { layer, stdout, stderr } = makeTestTerminal()
    return Effect.gen(function* () {
      yield* Terminal
      expect(stdout).toEqual([])
      expect(stderr).toEqual([])
    }).pipe(Effect.provide(layer))
  })
})
