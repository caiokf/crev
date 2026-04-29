import { Effect } from "effect"
import { TuiLive } from "../layers.js"
import { errorMessage } from "../util/cli-errors.js"
import type { CrevConfig } from "../services/CrevConfig.js"
import type { SchemaStore } from "../services/SchemaStore.js"
import type { ReviewStore } from "../services/ReviewStore.js"

/**
 * Services a dash action may depend on. TuiLive provides all of them,
 * so views can demand any subset without each one re-listing layers.
 */
export type DashServices = CrevConfig | SchemaStore | ReviewStore

/**
 * Dash-side equivalent of a CLI shim's `runPromiseExit` + `Exit.match`:
 * runs an action and normalises its result into a plain tagged union
 * that blessed callbacks can pattern-match without pulling Effect in.
 */
export type DashResult<A> =
  | { readonly kind: "ok"; readonly value: A }
  | { readonly kind: "error"; readonly message: string }

export async function runDashEffect<A, E>(
  action: Effect.Effect<A, E, DashServices>,
): Promise<DashResult<A>> {
  try {
    const value = await Effect.runPromise(action.pipe(Effect.provide(TuiLive)))
    return { kind: "ok", value }
  } catch (err) {
    return {
      kind: "error",
      message: errorMessage(err),
    }
  }
}
