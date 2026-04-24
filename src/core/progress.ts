/**
 * Pure event shapes for in-progress review lifecycle. The orchestrator
 * invokes an optional callback with these events so UI consumers (the
 * CLI spinner, the dash, tests) can render without pulling in Effect.
 *
 * This re-exports the same `ProgressEvent` union as `ProgressBus` so
 * Effect and non-Effect callers stay in lockstep.
 */
export type { ProgressEvent } from "../services/ProgressBus.js"

import type { ProgressEvent } from "../services/ProgressBus.js"

export type ProgressCallback = (event: ProgressEvent) => void
