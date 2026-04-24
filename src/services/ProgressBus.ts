import { Context, Effect, Layer, PubSub, Stream } from "effect"

/**
 * Lifecycle events for an in-progress `crev run`. The CLI spinner,
 * the future dash view, and tests all consume the same stream —
 * subscribers decide how to render.
 */
export type ProgressEvent =
  | {
      readonly kind: "run-started"
      readonly schema: string
      readonly reviewerCount: number
    }
  | {
      readonly kind: "reviewer-started"
      readonly name: string
      readonly runtime: string
      readonly model: string
    }
  | {
      readonly kind: "reviewer-completed"
      readonly name: string
      readonly durationMs: number
      readonly issueCount: number
      readonly exitCode: number
    }
  | {
      readonly kind: "reviewer-failed"
      readonly name: string
      readonly error: string
    }
  | {
      readonly kind: "triage-started"
      readonly issueCount: number
      readonly runtime: string
      readonly model: string
    }
  | {
      readonly kind: "triage-completed"
      readonly actionable: number
      readonly deferred: number
      readonly dismissed: number
      readonly durationMs: number
    }
  | {
      readonly kind: "run-completed"
      readonly durationMs: number
    }
  | {
      readonly kind: "run-failed"
      readonly error: string
    }

export interface ProgressBusService {
  /** Fire-and-forget publish. Safe from any fiber. */
  readonly publish: (event: ProgressEvent) => Effect.Effect<void>

  /**
   * Subscribe to the event stream. The returned Stream must be
   * scoped by the caller (`Stream.runForEach` or similar); when the
   * scope closes, the underlying subscription is released.
   */
  readonly subscribe: () => Stream.Stream<ProgressEvent>
}

export class ProgressBus extends Context.Tag("crev/ProgressBus")<
  ProgressBus,
  ProgressBusService
>() {}

/**
 * Live layer — a bounded `PubSub` broadcasts events to all
 * subscribers. Capacity of 256 is generous for a handful of reviewers
 * and keeps per-run memory flat even if a subscriber briefly lags.
 */
export const ProgressBusLive = Layer.effect(
  ProgressBus,
  Effect.gen(function* () {
    const hub = yield* PubSub.bounded<ProgressEvent>(256)

    return ProgressBus.of({
      publish: (event) => PubSub.publish(hub, event).pipe(Effect.asVoid),
      subscribe: () =>
        Stream.unwrapScoped(
          Effect.map(PubSub.subscribe(hub), (queue) => Stream.fromQueue(queue)),
        ),
    })
  }),
)

/**
 * Silent layer — drops every event. Used when a caller opts out of
 * progress reporting (JSON output, prompt-only mode).
 */
export const ProgressBusSilent = Layer.succeed(
  ProgressBus,
  ProgressBus.of({
    publish: () => Effect.void,
    subscribe: () => Stream.empty,
  }),
)

/**
 * Test helper — collect every published event into an array.
 * Returns the layer plus a sync accessor. Useful for asserting the
 * exact sequence emitted by an action.
 *
 * Note: this layer is synchronous, so events are observable in the
 * test immediately after the publishing effect completes.
 */
export const makeTestProgressBus = (): {
  layer: Layer.Layer<ProgressBus>
  events: () => ProgressEvent[]
} => {
  const captured: ProgressEvent[] = []

  const layer = Layer.succeed(
    ProgressBus,
    ProgressBus.of({
      publish: (event) =>
        Effect.sync(() => {
          captured.push(event)
        }),
      subscribe: () => Stream.fromIterable(captured),
    }),
  )

  return { layer, events: () => [...captured] }
}
