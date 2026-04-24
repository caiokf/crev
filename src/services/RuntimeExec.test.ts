import { describe, expect } from "vitest"
import { it } from "@effect/vitest"
import { Effect, Exit } from "effect"
import { makeTestRuntimeExec, RuntimeExec } from "./RuntimeExec.js"

describe("RuntimeExec test layer", () => {
  it.effect("runs the handler and returns its RawExecutionOutput", () => {
    const { layer } = makeTestRuntimeExec((runtime, request) => ({
      raw: `ran ${runtime} with ${request.taskName}`,
      exitCode: 0,
      durationMs: 12,
    }))

    return Effect.gen(function* () {
      const svc = yield* RuntimeExec
      const out = yield* svc.execute({
        runtime: "claude",
        request: {
          taskName: "review",
          model: "sonnet",
          prompt: "hi",
          promptFile: "/tmp/prompt.txt",
        },
      })
      expect(out.raw).toBe("ran claude with review")
      expect(out.exitCode).toBe(0)
    }).pipe(Effect.provide(layer))
  })

  it.effect("surfaces handler errors as RuntimeExecError", () => {
    const { layer } = makeTestRuntimeExec(() => {
      throw new Error("boom")
    })

    return Effect.gen(function* () {
      const svc = yield* RuntimeExec
      const exit = yield* Effect.exit(
        svc.execute({
          runtime: "claude",
          request: {
            taskName: "t",
            model: "m",
            prompt: "",
            promptFile: "/tmp/p",
          },
        }),
      )
      expect(Exit.isFailure(exit)).toBe(true)
      if (Exit.isFailure(exit)) {
        const err = exit.cause._tag === "Fail" ? exit.cause.error : null
        expect(err?._tag).toBe("RuntimeExecError")
      }
    }).pipe(Effect.provide(layer))
  })

  it.effect("getAdapter fails with RuntimeNotFoundError for unknown runtimes", () => {
    const { layer } = makeTestRuntimeExec(() => ({ raw: "", exitCode: 0, durationMs: 0 }))

    return Effect.gen(function* () {
      const svc = yield* RuntimeExec
      const exit = yield* Effect.exit(svc.getAdapter("nope"))
      expect(Exit.isFailure(exit)).toBe(true)
      if (Exit.isFailure(exit)) {
        const err = exit.cause._tag === "Fail" ? exit.cause.error : null
        expect(err?._tag).toBe("RuntimeNotFoundError")
      }
    }).pipe(Effect.provide(layer))
  })

  it.effect("getAdapter returns seeded adapter stubs", () => {
    const { layer } = makeTestRuntimeExec(
      () => ({ raw: "", exitCode: 0, durationMs: 0 }),
      { claude: { name: "claude", supportsCustomPrompt: true } },
    )

    return Effect.gen(function* () {
      const svc = yield* RuntimeExec
      const adapter = yield* svc.getAdapter("claude")
      expect(adapter.name).toBe("claude")
      expect(adapter.supportsCustomPrompt).toBe(true)
    }).pipe(Effect.provide(layer))
  })
})
