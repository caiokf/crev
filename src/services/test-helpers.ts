import { Effect } from "effect"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"

/**
 * Acquires a temp directory, hands it to `setup`, and removes it on
 * completion (success or failure). Use inside `it.effect` blocks so the
 * cleanup participates in the Effect lifecycle — a plain try/finally
 * would release before the returned Effect ever runs.
 */
export const withTempDir = <A, E, R>(
  setup: (root: string) => Effect.Effect<A, E, R>,
): Effect.Effect<A, E, R> =>
  Effect.acquireUseRelease(
    Effect.sync(() => fs.mkdtempSync(path.join(os.tmpdir(), "crev-test-"))),
    setup,
    (root) => Effect.sync(() => fs.rmSync(root, { recursive: true, force: true })),
  )
