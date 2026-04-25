import { Effect } from "effect"
import path from "node:path"
import { runVerify, applyVerifyStatuses, type VerifyStatus } from "../core/verify.js"
import { CrevConfig } from "../services/CrevConfig.js"
import { ReviewStore } from "../services/ReviewStore.js"
import { getOutputDir, resolveModelAlias, getRuntimeConfig } from "../core/config.js"
import type { ReviewResult } from "../core/types.js"
import type {
  ConfigParseError,
  FileNotFoundError,
  FileReadError,
  FileWriteError,
  ReviewNotFoundError,
  ReviewParseError,
} from "../errors.js"

export type VerifyInput = {
  /** Explicit review file path. When omitted, uses the latest review. */
  readonly filePath?: string
  /** Override runtime (defaults to config triage runtime, then "claude"). */
  readonly runtime?: string
  /** Override model (defaults to "sonnet"). */
  readonly model?: string
  readonly signal?: AbortSignal
}

export type VerifyOutput = {
  readonly filePath: string
  readonly result: ReviewResult
  readonly statuses: VerifyStatus[]
  readonly summary: { fixed: number; open: number; skipped: number }
  readonly durationMs: number
}

export const verifyAction = (
  input: VerifyInput,
): Effect.Effect<
  VerifyOutput,
  | ConfigParseError
  | FileNotFoundError
  | FileReadError
  | FileWriteError
  | ReviewNotFoundError
  | ReviewParseError,
  CrevConfig | ReviewStore
> =>
  Effect.gen(function* () {
    const cfg = yield* CrevConfig
    const store = yield* ReviewStore
    const { config, crevDir } = yield* cfg.load()

    let filePath: string
    let result: ReviewResult

    if (input.filePath) {
      filePath = path.resolve(input.filePath)
      result = yield* store.load(filePath)
    } else {
      const outputDir = getOutputDir(config, crevDir)
      const loaded = yield* store.latest(outputDir)
      filePath = loaded.filePath
      result = loaded.result
    }

    const runtime = input.runtime ?? config.triage.runtime ?? "claude"
    const model = resolveModelAlias(config, input.model ?? "sonnet")
    const rtConfig = getRuntimeConfig(config, runtime)

    const verifyResult = yield* Effect.promise(() =>
      runVerify({
        result,
        runtime,
        model,
        signal: input.signal,
        runtimeConfig: {
          command: rtConfig.command,
          env: rtConfig.env,
          args: rtConfig.args,
        },
      }),
    )

    applyVerifyStatuses(result, verifyResult.statuses)
    yield* store.save(filePath, result)

    return {
      filePath,
      result,
      statuses: verifyResult.statuses,
      summary: verifyResult.summary,
      durationMs: verifyResult.durationMs,
    }
  })
