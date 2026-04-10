import fs, { readFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import { withDefaults } from "./adapter-base.js"
import { execAbortable } from "./exec.js"
import type { RawExecutionOutput, RuntimeAdapter, RuntimeExecutionRequest, RuntimeHealth } from "./types.js"

export function createKimiRuntime(): RuntimeAdapter {
  return withDefaults({
    type: "cli",
    name: "kimi",
    models: ["kimi-k2.5", "kimi-k2-0905-preview", "kimi-k2-turbo-preview"] as const,
    defaultModel: "kimi-k2.5",
    supportsCustomPrompt: true,
    capabilities: {
      command: "kimi",
      promptStrategy: "stdin",
      requiresPty: false,
      supportsModelSelection: false,
      authMethods: [
        { type: "env", keys: ["MOONSHOT_API_KEY"] },
        { type: "auth-file", path: "~/.kimi/credentials", description: "Kimi credentials directory" },
      ],
      relevantEnvVars: ["MOONSHOT_API_KEY"],
    },

    async execute(request: RuntimeExecutionRequest): Promise<RawExecutionOutput> {
      const start = performance.now()
      const cmd = request.overrides?.command ?? "kimi"
      const prompt = readFileSync(request.promptFile, "utf-8")
      const args = ["--print", ...(request.overrides?.extraArgs ?? [])]
      const env = request.overrides?.env && Object.keys(request.overrides.env).length > 0
        ? { ...process.env, ...request.overrides.env }
        : undefined

      try {
        const { stdout } = await execAbortable(cmd, args, {
          ...(env ? { env } : {}),
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
        return { name, command: "kimi", installed: false, version: null, authenticated: "unknown", authDetail: "not installed", error: null }
      }

      let version: string | null = null
      try {
        const result = await execAbortable("kimi", ["--version"], { timeout: 5000 })
        const match = result.stdout.trim().match(/(\d+\.\d+\.\d+)/)
        version = match ? match[1] : result.stdout.trim()
      } catch {}

      let authenticated: "yes" | "no" | "unknown" = "no"
      let authDetail = ""

      if (process.env.MOONSHOT_API_KEY) {
        authenticated = "yes"
        authDetail = "env: MOONSHOT_API_KEY"
      } else {
        const credDir = path.join(os.homedir(), ".kimi", "credentials")
        try {
          if (fs.existsSync(credDir) && fs.readdirSync(credDir).length > 0) {
            authenticated = "yes"
            authDetail = "~/.kimi/credentials"
          }
        } catch {}
      }

      if (authenticated === "no") {
        authDetail = "no MOONSHOT_API_KEY and no ~/.kimi/credentials"
      }

      return { name, command: "kimi", installed: true, version, authenticated, authDetail, error: null }
    },
  })
}
