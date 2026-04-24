import { Effect } from "effect"
import path from "node:path"
import { CrevConfig } from "../services/CrevConfig.js"
import { ReviewStore } from "../services/ReviewStore.js"
import { getOutputDir } from "../core/config.js"
import type { ReviewResult } from "../core/types.js"
import type {
  ConfigParseError,
  FileNotFoundError,
  FileReadError,
  ReviewNotFoundError,
  ReviewParseError,
} from "../errors.js"

export type ShowInput = {
  /**
   * Optional explicit review file. Relative paths resolve against the
   * current working directory to match historical `crev show <file>`
   * behavior. When omitted the latest review is loaded from the
   * configured output directory.
   */
  readonly filePath?: string
}

export type ShowOutput = {
  readonly filePath: string
  readonly result: ReviewResult
  /** `true` when `filePath` was discovered via `latest` lookup. */
  readonly isLatest: boolean
}

export const showAction = (
  input: ShowInput,
): Effect.Effect<
  ShowOutput,
  | ConfigParseError
  | FileNotFoundError
  | FileReadError
  | ReviewNotFoundError
  | ReviewParseError,
  CrevConfig | ReviewStore
> =>
  Effect.gen(function* () {
    const store = yield* ReviewStore

    if (input.filePath) {
      const resolved = path.resolve(input.filePath)
      const result = yield* store.load(resolved)
      return { filePath: resolved, result, isLatest: false }
    }

    const cfg = yield* CrevConfig
    const { crevDir, config } = yield* cfg.load()
    const outputDir = getOutputDir(config, crevDir)
    const loaded = yield* store.latest(outputDir)
    return { filePath: loaded.filePath, result: loaded.result, isLatest: true }
  })
