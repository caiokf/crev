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
}

/**
 * Execute a simple LLM call (no diff, no output format) through a valet runtime.
 * Used by the normalizer, triage agent, and schema auto-selector.
 */
export async function callLlm(opts: LlmCallOptions): Promise<string> {
  return withTempPromptFile(`crev-prompt-${opts.taskName.toLowerCase()}`, opts.prompt, async (promptFile) => {
    const rt = getRuntime(opts.runtime)
    const result = await rt.execute({
      taskName: opts.taskName,
      model: opts.model,
      prompt: opts.prompt,
      promptFile,
      diff: { diffContent: "", diffFile: "", type: "all" },
      outputFormat: "",
      signal: opts.signal,
    })
    return result.raw
  })
}
