import fs from "node:fs"
import path from "node:path"
import { z } from "zod"
import YAML from "yaml"

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
      context: z.array(z.string()).default([]),
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
  const dir = startDir ?? process.cwd()
  return path.resolve(dir, ".crev")
}

export function loadConfig(crevDir: string): Config {
  const configPath = path.join(crevDir, "config.yaml")
  if (!fs.existsSync(configPath)) {
    return configSchema.parse({})
  }

  const raw = fs.readFileSync(configPath, "utf-8")
  const parsed = YAML.parse(raw)
  return configSchema.parse(parsed)
}

export function resolveModelAlias(config: Config, model: string): string {
  return config.aliases[model] ?? model
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
