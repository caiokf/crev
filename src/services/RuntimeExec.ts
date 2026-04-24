import { Context, Effect, Layer } from "effect"
import {
  getRuntime,
  type RawExecutionOutput,
  type RuntimeAdapter,
  type RuntimeExecutionRequest,
} from "@caiokf/valet"
import { RuntimeExecError, RuntimeNotFoundError } from "../errors.js"

export type ExecuteInput = {
  readonly runtime: string
  readonly request: RuntimeExecutionRequest
}

export interface RuntimeExecService {
  /**
   * Look up the runtime adapter by name and run `request`.
   * Missing runtimes fail with `RuntimeNotFoundError`; runtime-level
   * errors (network, auth, crash) surface as `RuntimeExecError`.
   */
  readonly execute: (
    input: ExecuteInput,
  ) => Effect.Effect<RawExecutionOutput, RuntimeExecError | RuntimeNotFoundError>

  /** Read-only adapter lookup — useful for checking capabilities without executing. */
  readonly getAdapter: (
    runtime: string,
  ) => Effect.Effect<RuntimeAdapter, RuntimeNotFoundError>
}

export class RuntimeExec extends Context.Tag("crev/RuntimeExec")<
  RuntimeExec,
  RuntimeExecService
>() {}

/**
 * Live layer — delegates to `@caiokf/valet`'s registry. Wraps the
 * adapter's async `execute` in `Effect.tryPromise` so failures become
 * typed `RuntimeExecError`s.
 */
export const RuntimeExecLive = Layer.succeed(
  RuntimeExec,
  RuntimeExec.of({
    getAdapter: (runtime) =>
      Effect.try({
        try: () => getRuntime(runtime),
        catch: () => new RuntimeNotFoundError({ runtime }),
      }),

    execute: (input) =>
      Effect.gen(function* () {
        const adapter = yield* Effect.try({
          try: () => getRuntime(input.runtime),
          catch: () => new RuntimeNotFoundError({ runtime: input.runtime }),
        })

        return yield* Effect.tryPromise({
          try: () => adapter.execute(input.request),
          catch: (cause) =>
            new RuntimeExecError({
              runtime: input.runtime,
              reason: cause instanceof Error ? cause.message : String(cause),
              cause,
            }),
        })
      }),
  }),
)

/**
 * Test layer — supply a function that produces `RawExecutionOutput`
 * per (runtime, request) pair. Throwing an Error or returning a
 * rejected promise surfaces as `RuntimeExecError`. The adapter
 * returned by `getAdapter` is a synthetic stub just sufficient for
 * capability checks.
 */
export type ExecuteHandler = (
  runtime: string,
  request: RuntimeExecutionRequest,
) => Promise<RawExecutionOutput> | RawExecutionOutput

export const makeTestRuntimeExec = (
  handler: ExecuteHandler,
  adapters: Readonly<Record<string, Partial<RuntimeAdapter>>> = {},
): { layer: Layer.Layer<RuntimeExec> } => {
  const layer = Layer.succeed(
    RuntimeExec,
    RuntimeExec.of({
      getAdapter: (runtime) => {
        const adapter = adapters[runtime]
        if (!adapter) return Effect.fail(new RuntimeNotFoundError({ runtime }))
        return Effect.succeed(adapter as RuntimeAdapter)
      },

      execute: (input) =>
        Effect.tryPromise({
          try: async () => handler(input.runtime, input.request),
          catch: (cause) =>
            new RuntimeExecError({
              runtime: input.runtime,
              reason: cause instanceof Error ? cause.message : String(cause),
              cause,
            }),
        }),
    }),
  )
  return { layer }
}
