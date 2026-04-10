import { execAbortable } from "./exec.js"
import type { RawExecutionOutput, RuntimeAdapter, RuntimeExecutionRequest, RuntimeHealth } from "./types.js"

export function createClaudeRuntime(): RuntimeAdapter {
  return {
    type: "cli",
    name: "claude",
    models: ["opus", "sonnet", "haiku"] as const,
    defaultModel: "sonnet",
    supportsCustomPrompt: true,

    async execute(request: RuntimeExecutionRequest): Promise<RawExecutionOutput> {
      const start = performance.now()
      const args = ["--print", "--model", resolveModel(request.model)]

      try {
        const { stdout } = await execAbortable("claude", args, {
          maxBuffer: 50 * 1024 * 1024,
          timeout: 10 * 60 * 1000,
          signal: request.signal,
          stdin: `Read and follow the instructions in this file: ${request.promptFile}`,
        })

        return {
          raw: stdout,
          exitCode: 0,
          durationMs: performance.now() - start,
        }
      } catch (error) {
        const err = error as { stdout?: string; code?: number }
        return {
          raw: err.stdout ?? String(error),
          exitCode: err.code ?? 1,
          durationMs: performance.now() - start,
        }
      }
    },

    async healthCheck(): Promise<RuntimeHealth> {
      const name = "claude"

      try {
        await execAbortable("which", ["claude"], { timeout: 5000 })
      } catch {
        return { name, installed: false, version: null, authenticated: "unknown", authDetail: "not installed", error: null }
      }

      let version: string | null = null
      try {
        const result = await execAbortable("claude", ["--version"], { timeout: 5000 })
        version = result.stdout.trim()
      } catch {}

      let authenticated: "yes" | "no" | "unknown" = "unknown"
      let authDetail = ""
      try {
        const authResult = await execAbortable("claude", ["auth", "status"], { timeout: 5000 })
        const output = authResult.stdout + authResult.stderr
        if (/logged in|authenticated|active/i.test(output)) {
          authenticated = "yes"
          authDetail = "claude auth status: authenticated"
        } else {
          authenticated = "no"
          authDetail = "claude auth status: not authenticated"
        }
      } catch {
        if (process.env.ANTHROPIC_API_KEY) {
          authenticated = "yes"
          authDetail = "env: ANTHROPIC_API_KEY"
        } else {
          authenticated = "unknown"
          authDetail = "could not determine (no env var, auth command failed)"
        }
      }

      return { name, installed: true, version, authenticated, authDetail, error: null }
    },
  }
}

function resolveModel(model: string): string {
  const map: Record<string, string> = {
    opus: "claude-opus-4-6",
    sonnet: "claude-sonnet-4-6",
    haiku: "claude-haiku-4-5-20251001",
  }
  return map[model] ?? model
}
