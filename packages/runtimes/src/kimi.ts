import { readFileSync } from "node:fs"
import { execAbortable } from "./exec.js"
import type { RawExecutionOutput, RuntimeAdapter, RuntimeExecutionRequest, RuntimeHealth } from "./types.js"

export function createKimiRuntime(): RuntimeAdapter {
  return {
    type: "cli",
    name: "kimi",
    models: ["kimi-k2.5", "kimi-k2-0905-preview", "kimi-k2-turbo-preview"] as const,
    defaultModel: "kimi-k2.5",
    supportsCustomPrompt: true,

    async execute(request: RuntimeExecutionRequest): Promise<RawExecutionOutput> {
      const start = performance.now()
      const prompt = readFileSync(request.promptFile, "utf-8")
      const args = ["--print"]

      try {
        const { stdout } = await execAbortable("kimi", args, {
          maxBuffer: 50 * 1024 * 1024,
          timeout: 10 * 60 * 1000,
          signal: request.signal,
          stdin: prompt,
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
      const name = "kimi"

      try {
        await execAbortable("which", ["kimi"], { timeout: 5000 })
      } catch {
        return { name, installed: false, version: null, authenticated: "unknown", authDetail: "not installed", error: null }
      }

      let version: string | null = null
      try {
        const result = await execAbortable("kimi", ["--version"], { timeout: 5000 })
        version = result.stdout.trim()
      } catch {}

      const authenticated: "yes" | "no" | "unknown" = process.env.MOONSHOT_API_KEY ? "yes" : "no"
      const authDetail = process.env.MOONSHOT_API_KEY ? "env: MOONSHOT_API_KEY" : "env: MOONSHOT_API_KEY missing"

      return { name, installed: true, version, authenticated, authDetail, error: null }
    },
  }
}
