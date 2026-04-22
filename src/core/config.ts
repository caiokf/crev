import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { z } from "zod"
import YAML from "yaml"
import { annotatedMerge, deepMerge, type ProvenanceMap } from "./merge.js"

const runtimeConfigSchema = z.object({
  command: z.string().optional(),
  env: z.record(z.string(), z.string()).default({}),
  args: z.array(z.string()).default([]),
})

export type RuntimeConfig = z.infer<typeof runtimeConfigSchema>

const configSchema = z.object({
  defaults: z
    .object({
      schema: z.string().default("quick"),
      type: z.enum(["all", "committed", "uncommitted"]).default("all"),
      base: z.string().default("main"),
    })
    .default({}),
  runtimes: z.record(z.string(), runtimeConfigSchema).default({}),
  aliases: z.record(z.string(), z.string()).default({}),
  diff: z
    .object({
      exclude: z.array(z.string()).default([]),
    })
    .default({}),
  output: z
    .object({
      dir: z.string().default(".crev/reviews"),
      format: z.enum(["json", "markdown", "both"]).default("json"),
    })
    .default({}),
  normalizer: z
    .object({
      enabled: z.boolean().default(true),
      runtime: z.string().default("claude"),
      model: z.string().default("haiku"),
    })
    .default({}),
  triage: z
    .object({
      enabled: z.boolean().default(false),
      runtime: z.string().default("claude"),
      model: z.string().default("opus"),
      deduplicate: z.boolean().default(false),
      recategorize: z.boolean().default(false),
      prompt: z
        .string()
        .default(
          [
            "You are a senior engineer acting as a devil's advocate for code review findings.",
            "For each issue, argue against fixing it. Consider:",
            "- Is this a real bug or a theoretical concern?",
            "- Does the project's architecture/ADRs explain why it's done this way?",
            "- Is this out of scope for the current change?",
            "- Is the severity overstated?",
            "",
            "Only mark an issue 'actionable' if you cannot find a good reason to dismiss it.",
          ].join("\n"),
        ),
    })
    .default({}),
})

export type Config = z.infer<typeof configSchema>

export function findCrevDir(startDir?: string): string {
  let dir = startDir ?? process.cwd()

  while (dir !== path.dirname(dir)) {
    const candidate = path.join(dir, ".crev")
    if (fs.existsSync(candidate)) return candidate
    dir = path.dirname(dir)
  }

  // Fallback: return .crev relative to the starting directory
  return path.resolve(startDir ?? process.cwd(), ".crev")
}

export function getUserCrevDir(): string {
  return path.join(os.homedir(), ".crev")
}

function loadRawYaml(filePath: string): Record<string, unknown> | null {
  if (!fs.existsSync(filePath)) return null
  const raw = fs.readFileSync(filePath, "utf-8")
  const parsed = YAML.parse(raw)
  return parsed && typeof parsed === "object" ? parsed : null
}

/**
 * Returns the ordered config file paths from lowest to highest priority.
 * user (~/.crev/config.yaml) < project (.crev/config.yaml) < local (.crev/config.local.yaml)
 */
export function getConfigLayerPaths(crevDir: string): { label: string; path: string }[] {
  return [
    { label: "~/.crev/config.yaml", path: path.join(getUserCrevDir(), "config.yaml") },
    { label: ".crev/config.yaml", path: path.join(crevDir, "config.yaml") },
    { label: ".crev/config.local.yaml", path: path.join(crevDir, "config.local.yaml") },
  ]
}

/**
 * Load config from a single file (legacy behavior, used in tests).
 */
export function loadConfig(crevDir: string): Config {
  const configPath = path.join(crevDir, "config.yaml")
  if (!fs.existsSync(configPath)) {
    return configSchema.parse({})
  }

  const raw = fs.readFileSync(configPath, "utf-8")
  const parsed = YAML.parse(raw)
  return configSchema.parse(parsed ?? {})
}

/**
 * Load config with layered merging:
 *   ~/.crev/config.yaml < .crev/config.yaml < .crev/config.local.yaml
 * Deep merges objects, arrays replace, scalars overwrite.
 */
export function loadLayeredConfig(crevDir: string): Config {
  const layerPaths = getConfigLayerPaths(crevDir)
  const layers: Record<string, unknown>[] = []

  for (const layer of layerPaths) {
    const data = loadRawYaml(layer.path)
    if (data) layers.push(data)
  }

  if (layers.length === 0) return configSchema.parse({})

  const merged = deepMerge(...layers)
  return configSchema.parse(merged)
}

/**
 * Load config with provenance annotations (for `crev config` display).
 */
export function loadAnnotatedConfig(crevDir: string): { config: Config; provenance: ProvenanceMap } {
  const layerPaths = getConfigLayerPaths(crevDir)
  const layers: { label: string; data: Record<string, unknown> }[] = []

  for (const layer of layerPaths) {
    const data = loadRawYaml(layer.path)
    if (data) layers.push({ label: layer.label, data })
  }

  if (layers.length === 0) {
    return { config: configSchema.parse({}), provenance: {} }
  }

  const { merged, provenance } = annotatedMerge(layers)
  return { config: configSchema.parse(merged), provenance }
}

export function resolveModelAlias(config: Config, model: string): string {
  return config.aliases[model] ?? model
}

const CLAUDE_MODEL_SHORTHANDS: Record<string, string> = {
  opus: "claude-opus-4-6",
  sonnet: "claude-sonnet-4-6",
  haiku: "claude-haiku-4-5-20251001",
}

export function resolveClaudeModelId(config: Config, model: string): string {
  const aliased = resolveModelAlias(config, model)
  return CLAUDE_MODEL_SHORTHANDS[aliased] ?? aliased
}

export function getOutputDir(config: Config, crevDir: string): string {
  if (path.isAbsolute(config.output.dir)) {
    return config.output.dir
  }
  return path.resolve(path.dirname(crevDir), config.output.dir)
}

export function loadAgentPrompt(agentPath: string): string | null {
  const resolved = path.resolve(agentPath)
  if (!fs.existsSync(resolved)) return null
  return fs.readFileSync(resolved, "utf-8").trim()
}

export function getRuntimeConfig(config: Config, runtimeName: string): RuntimeConfig {
  return config.runtimes[runtimeName] ?? { env: {}, args: [] }
}

export function getOutputFormat(): string {
  return JSON.stringify(
    {
      issues: [
        {
          id: "unique-issue-id",
          file: "exact/path/from/source/headers.ts",
          line: 0,
          severity: "low | medium | high | critical",
          category: "bug | security | performance | style | compliance | architecture",
          title: "Short title of the issue",
          description: "Detailed description of the issue and suggested fix",
        },
      ],
    },
    null,
    2,
  ) + "\n\nIMPORTANT: For the \"file\" field, use the exact file paths as they appear in the source headers (e.g. \"--- packages/cli/src/commands/init.ts ---\"). Do NOT abbreviate or invent paths."
}
