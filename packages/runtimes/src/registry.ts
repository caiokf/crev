import type { RuntimeAdapter } from "./types.js"
import { createClaudeRuntime } from "./claude.js"
import { createCodeRabbitRuntime } from "./coderabbit.js"
import { createCodexRuntime } from "./codex.js"
import { createGeminiRuntime } from "./gemini.js"
import { createKimiRuntime } from "./kimi.js"
import { createOpenCodeRuntime } from "./opencode.js"

const runtimes = new Map<string, () => RuntimeAdapter>([
  ["claude", () => createClaudeRuntime()],
  ["codex", () => createCodexRuntime()],
  ["gemini", () => createGeminiRuntime()],
  ["kimi", () => createKimiRuntime()],
  ["coderabbit", () => createCodeRabbitRuntime()],
  ["opencode", () => createOpenCodeRuntime()],
])

export function getRuntime(name: string): RuntimeAdapter {
  const factory = runtimes.get(name)
  if (!factory) {
    const available = [...runtimes.keys()].join(", ")
    throw new Error(`Unknown runtime: "${name}". Available: ${available}`)
  }
  return factory()
}

export function getAllRuntimes(): RuntimeAdapter[] {
  return [...runtimes.entries()].map(([, factory]) => factory())
}

export function getRuntimeNames(): string[] {
  return [...runtimes.keys()]
}
