import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { readFileSync } from "node:fs"
import { withDefaults } from "../adapter-base.js"
import { execAbortable } from "../exec.js"
import type { RawExecutionOutput, RuntimeAdapter, RuntimeExecutionRequest, RuntimeHealth } from "../types.js"

export function createPiRuntime(): RuntimeAdapter {
  return withDefaults({
    type: "cli",
    name: "pi",
    models: [
      "anthropic/claude-sonnet-4-6",
      "anthropic/claude-opus-4-6",
      "anthropic/claude-haiku-4-5-20251001",
      "google/gemini-2.5-pro",
      "google/gemini-2.5-flash",
      "openai/gpt-5",
      "openai/gpt-5-mini",
    ] as const,
    defaultModel: "anthropic/claude-sonnet-4-6",
    supportsCustomPrompt: true,
    capabilities: {
      command: "pi",
      promptStrategy: "stdin",
      requiresPty: false,
      supportsModelSelection: true,
      authMethods: [
        { type: "auth-file", path: "~/.pi/agent/auth.json", description: "Pi agent auth file" },
        { type: "env", keys: ["ANTHROPIC_API_KEY", "OPENAI_API_KEY", "GOOGLE_API_KEY", "GEMINI_API_KEY"] },
      ],
      relevantEnvVars: ["ANTHROPIC_API_KEY", "OPENAI_API_KEY", "GOOGLE_API_KEY", "GEMINI_API_KEY"],
    },

    async execute(request: RuntimeExecutionRequest): Promise<RawExecutionOutput> {
      const start = performance.now()
      const cmd = request.overrides?.command ?? "pi"
      const prompt = readFileSync(request.promptFile, "utf-8")
      const args = ["-p", "--model", request.model, ...(request.overrides?.extraArgs ?? [])]
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
      const name = "pi"

      try {
        await execAbortable("which", ["pi"], { timeout: 5000 })
      } catch {
        return { name, command: "pi", installed: false, version: null, authenticated: "unknown", authDetail: "not installed", error: null }
      }

      let version: string | null = null
      try {
        const result = await execAbortable("pi", ["--version"], { timeout: 5000 })
        version = (result.stdout || result.stderr).trim() || null
      } catch {}

      let authenticated: "yes" | "no" | "unknown" = "no"
      let authDetail = ""

      const authFile = path.join(os.homedir(), ".pi", "agent", "auth.json")
      try {
        if (fs.existsSync(authFile)) {
          authenticated = "yes"
          authDetail = "~/.pi/agent/auth.json"
        }
      } catch {}

      if (authenticated === "no") {
        if (process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY || process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY) {
          authenticated = "yes"
          authDetail = "env: API key detected"
        } else {
          authDetail = "no ~/.pi/agent/auth.json and no API key env vars"
        }
      }

      return { name, command: "pi", installed: true, version, authenticated, authDetail, error: null }
    },
  })
}

export const createAdapter = createPiRuntime
