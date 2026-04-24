import { describe, expect } from "vitest"
import { it } from "@effect/vitest"
import { Effect } from "effect"
import { makeTestPrompter, Prompter } from "./Prompter.js"

describe("Prompter test layer", () => {
  it.effect("returns scripted checkbox answers in order", () => {
    const { layer, remaining } = makeTestPrompter([
      { kind: "checkbox", values: ["claude"] },
      { kind: "checkbox", values: ["quick", "standard"] },
    ])

    return Effect.gen(function* () {
      const prompter = yield* Prompter
      const first = yield* prompter.checkbox<string>({ message: "tools?", choices: [] })
      const second = yield* prompter.checkbox<string>({ message: "schemas?", choices: [] })
      expect(first).toEqual(["claude"])
      expect(second).toEqual(["quick", "standard"])
      expect(remaining()).toBe(0)
    }).pipe(Effect.provide(layer))
  })

  it.effect("returns scripted confirm answers", () => {
    const { layer } = makeTestPrompter([{ kind: "confirm", value: false }])

    return Effect.gen(function* () {
      const prompter = yield* Prompter
      const answer = yield* prompter.confirm({ message: "ok?", default: true })
      expect(answer).toBe(false)
    }).pipe(Effect.provide(layer))
  })

  it.effect("throws when the script and request kind disagree", () => {
    const { layer } = makeTestPrompter([{ kind: "confirm", value: true }])

    return Effect.gen(function* () {
      const prompter = yield* Prompter
      const exit = yield* Effect.exit(
        prompter.checkbox<string>({ message: "ignored", choices: [] }),
      )
      expect(exit._tag).toBe("Failure")
    }).pipe(Effect.provide(layer))
  })

  it.effect("throws when the script is exhausted", () => {
    const { layer } = makeTestPrompter([])

    return Effect.gen(function* () {
      const prompter = yield* Prompter
      const exit = yield* Effect.exit(prompter.confirm({ message: "x" }))
      expect(exit._tag).toBe("Failure")
    }).pipe(Effect.provide(layer))
  })
})
