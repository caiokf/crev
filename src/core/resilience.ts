import type { Config } from "./config.js"

export type FailbackEntry = {
  runtime: string
  model: string
}

export type ResilienceResult<T> = T & {
  fallback?: {
    originalRuntime: string
    originalModel: string
    reason: string
  }
}

export type RetryableCheck = {
  retryable: boolean
  reason: string
}

/**
 * Determine if an error is worth retrying. Non-retryable errors include
 * user cancellation and abort signals.
 */
export function isRetryable(error: unknown): RetryableCheck {
  if (error instanceof Error) {
    // AbortError from AbortController means user cancelled
    if (error.name === "AbortError") {
      return { retryable: false, reason: "User cancelled" }
    }

    const msg = error.message.toLowerCase()

    // Authentication / config errors won't be fixed by retrying
    if (msg.includes("authentication") || msg.includes("unauthorized") || msg.includes("api key")) {
      return { retryable: false, reason: "Authentication error" }
    }

    // Model not found / invalid config
    if (msg.includes("model not found") || msg.includes("invalid model")) {
      return { retryable: false, reason: "Invalid model" }
    }

    // Command not found (runtime not installed)
    if (msg.includes("enoent") || msg.includes("command not found") || msg.includes("not found")) {
      return { retryable: false, reason: "Runtime not installed" }
    }
  }

  // Everything else (rate limits, transient failures, network errors) is retryable
  return { retryable: true, reason: "Transient error" }
}

/**
 * Parse the failback config map. Keys and values are "runtime/model" strings.
 */
export function parseFailbackKey(key: string): FailbackEntry | null {
  const parts = key.split("/")
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null
  return { runtime: parts[0], model: parts[1] }
}

/**
 * Look up the failback target for a given runtime/model pair.
 */
export function getFailback(config: Config, runtime: string, model: string): FailbackEntry | null {
  const key = `${runtime}/${model}`
  const target = config.failback?.[key]
  if (!target) return null

  const parsed = parseFailbackKey(target)
  return parsed
}

/**
 * Wraps an async operation with retry + failback logic.
 *
 * Flow:
 *   attempt 1: original runtime/model
 *     → success: return
 *     → failure (retryable):
 *       attempt 2: same runtime/model (retry)
 *         → success: return
 *         → failure: check failback chain
 *           attempt 3: fallback runtime/model
 *             → success: return (marked as fallback)
 *             → failure: throw
 *     → failure (non-retryable): throw immediately
 */
export async function withResilience<T>(
  fn: (runtime: string, model: string) => Promise<T>,
  runtime: string,
  model: string,
  config: Config,
  signal?: AbortSignal,
): Promise<ResilienceResult<T>> {
  // Attempt 1: original runtime/model
  try {
    const result = await fn(runtime, model)
    return result as ResilienceResult<T>
  } catch (firstError) {
    // Bail immediately if signal is aborted
    if (signal?.aborted) throw firstError

    const check = isRetryable(firstError)
    if (!check.retryable) throw firstError

    // Attempt 2: retry with same runtime/model
    try {
      const result = await fn(runtime, model)
      return result as ResilienceResult<T>
    } catch (retryError) {
      if (signal?.aborted) throw retryError

      const retryCheck = isRetryable(retryError)
      if (!retryCheck.retryable) throw retryError

      // Attempt 3: failback chain
      const fallback = getFailback(config, runtime, model)
      if (!fallback) throw retryError

      try {
        const result = await fn(fallback.runtime, fallback.model)
        return {
          ...result,
          fallback: {
            originalRuntime: runtime,
            originalModel: model,
            reason: `${runtime}/${model} failed: ${retryError instanceof Error ? retryError.message : String(retryError)}`,
          },
        } as ResilienceResult<T>
      } catch (fallbackError) {
        // All attempts exhausted — throw the fallback error
        throw fallbackError
      }
    }
  }
}
