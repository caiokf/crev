import { getRuntime } from "@caiokf/valet"
import { withTempPromptFile } from "./temp-prompt.js"

export type LlmCallOptions = {
  taskName: string
  runtime: string
  model: string
  prompt: string
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
    })
    return result.raw
  })
}
