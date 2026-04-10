import { execAbortable } from "./exec.js"
import type { PreflightResult, RuntimeAdapter, RuntimeCapabilities, RuntimeExecutionRequest } from "./types.js"

/**
 * Provides default implementations for validateModel and preflight.
 * Each runtime calls this with its adapter object to fill in shared behavior.
 */
export function withDefaults(
  adapter: Omit<RuntimeAdapter, "validateModel" | "preflight">,
): RuntimeAdapter {
  return {
    ...adapter,

    validateModel(model: string): boolean {
      return adapter.models.includes(model)
    },

    async preflight(request: Pick<RuntimeExecutionRequest, "model" | "overrides">): Promise<PreflightResult> {
      const issues: string[] = []

      // Check model validity
      if (!adapter.models.includes(request.model) && request.model !== "default") {
        issues.push(`Model "${request.model}" is not in ${adapter.name}'s supported models: ${adapter.models.join(", ")}`)
      }

      // Check installation
      const cmd = request.overrides?.command ?? adapter.capabilities.command
      try {
        await execAbortable("which", [cmd.split(" ")[0]], { timeout: 3000 })
      } catch {
        issues.push(`Command "${cmd}" not found in PATH`)
      }

      return { ok: issues.length === 0, issues }
    },
  }
}
