import { readFileSync } from "node:fs"
import { execAbortable } from "./exec.js"
import type { RawExecutionOutput, RuntimeAdapter, RuntimeExecutionRequest, RuntimeHealth } from "./types.js"

export function createGeminiRuntime(): RuntimeAdapter {
  return {
    type: "cli",
    name: "gemini",
    models: ["gemini-2.5-pro", "gemini-2.5-flash", "gemini-3-pro-preview", "gemini-3-flash-preview"] as const,
    defaultModel: "gemini-2.5-pro",
    supportsCustomPrompt: true,

    async execute(request: RuntimeExecutionRequest): Promise<RawExecutionOutput> {
      const start = performance.now()
      const prompt = readFileSync(request.promptFile, "utf-8")
      const args = ["-m", request.model]

      try {
        const { stdout } = await execAbortable("gemini", args, {
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
      const name = "gemini"

      try {
        await execAbortable("which", ["gemini"], { timeout: 5000 })
      } catch {
        return { name, command: "gemini", installed: false, version: null, authenticated: "unknown", authDetail: "not installed", error: null }
      }

      let version: string | null = null
      try {
        const result = await execAbortable("gemini", ["--version"], { timeout: 5000 })
        version = result.stdout.trim()
      } catch {}

      const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY
      const authenticated: "yes" | "no" | "unknown" = apiKey ? "yes" : "no"
      const authDetail = apiKey
        ? `env: ${process.env.GEMINI_API_KEY ? "GEMINI_API_KEY" : "GOOGLE_API_KEY"}`
        : "env: GEMINI_API_KEY missing"

      return { name, command: "gemini", installed: true, version, authenticated, authDetail, error: null }
    },
  }
}
