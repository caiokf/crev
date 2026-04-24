import { Effect } from "effect"
import type { DiffInput } from "@caiokf/valet"
import { CrevConfig } from "../services/CrevConfig.js"
import { resolveDiff as resolveDiffSync, cleanupDiffFile } from "../core/diff.js"
import type { DiffSource } from "../core/types.js"
import { DiffResolutionError } from "../errors.js"
import type { ConfigParseError } from "../errors.js"

export type DiffActionInput = {
  readonly slug?: string
  readonly source: DiffSource
}

export type DiffActionOutput = {
  readonly diff: DiffInput
  /** Release the temp diff file created during resolution. */
  readonly cleanup: () => void
}

/**
 * Resolve a diff against the current repo + configured excludes.
 * Returns the parsed diff along with a `cleanup` callback so callers
 * (CLI, TUI) can release the temporary file when they're done.
 *
 * Wrapping is intentionally minimal — once the dedicated Git service
 * lands (Task #7), the underlying git execFile calls will move there.
 */
export const diffAction = (
  input: DiffActionInput,
): Effect.Effect<
  DiffActionOutput,
  DiffResolutionError | ConfigParseError,
  CrevConfig
> =>
  Effect.gen(function* () {
    const cfg = yield* CrevConfig
    const { crevDir, config } = yield* cfg.load()

    const diff = yield* Effect.tryPromise({
      try: () =>
        resolveDiffSync({
          slug: input.slug ?? "preview",
          source: input.source,
          exclude: config.diff.exclude,
          crevDir,
        }),
      catch: (cause) =>
        new DiffResolutionError({
          reason: cause instanceof Error ? cause.message : String(cause),
          cause,
        }),
    })

    return { diff, cleanup: () => cleanupDiffFile(diff) }
  })
