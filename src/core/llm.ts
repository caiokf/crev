import { getRuntime } from "@caiokf/valet"
import { withTempPromptFile } from "./temp-prompt.js"

export type LlmCallOptions = {
  taskName: string
  runtime: string
  model: string
  prompt: string
  /**
   * Optional abort signal. When the signal fires, the underlying
   * runtime cancels its subprocess (valet forwards this to
   * `execAbortable`). Required for user-initiated cancellation of
   * in-flight triage / normalizer / auto-select calls — without
   * it those long-running LLM calls would keep burning tokens
   * after the user pressed [q].
   */
  signal?: AbortSignal
  /** Extra CLI args forwarded to the runtime (e.g. --max-turns). */
  extraArgs?: string[]
  /** Runtime config overrides (command, env, args from config.runtimes). */
  runtimeConfig?: {
    command?: string
    env?: Record<string, string>
    args?: string[]
  }
}

/**
 * Execute a simple LLM call (no diff, no output format) through a valet runtime.
 * Used by the normalizer, triage agent, and schema auto-selector.
 */
export async function callLlm(opts: LlmCallOptions): Promise<string> {
  return withTempPromptFile(`crev-prompt-${opts.taskName.toLowerCase()}`, opts.prompt, async (promptFile) => {
    const rt = getRuntime(opts.runtime)
    const mergedArgs = [
      ...(opts.runtimeConfig?.args ?? []),
      ...(opts.extraArgs ?? []),
    ]
    const hasOverrides =
      opts.runtimeConfig?.command ||
      (opts.runtimeConfig?.env && Object.keys(opts.runtimeConfig.env).length > 0) ||
      mergedArgs.length > 0
    const result = await rt.execute({
      taskName: opts.taskName,
      model: opts.model,
      prompt: opts.prompt,
      promptFile,
      diff: { diffContent: "", diffFile: "", type: "all" },
      outputFormat: "",
      signal: opts.signal,
      overrides: hasOverrides
        ? {
            command: opts.runtimeConfig?.command,
            env: opts.runtimeConfig?.env,
            extraArgs: mergedArgs.length > 0 ? mergedArgs : undefined,
          }
        : undefined,
    })
    return result.raw
  })
}
