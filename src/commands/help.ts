import type { Command } from "commander"
import chalk from "chalk"
import { VALID_MODELS } from "../core/schema.js"
import {
  COMMAND_DESCRIPTIONS,
  COMMON_OPTION_DESCRIPTIONS,
  GENERAL_HELP_COMMANDS,
  HELP_COMMAND_ORDER,
  QUICKSTART_STEPS,
  RUN_HELP_FLAGS,
} from "./metadata.js"

export function registerHelpCommand(program: Command): void {
  program
    .command("help [topic]")
    .description(COMMAND_DESCRIPTIONS.help)
    .option("--json", COMMON_OPTION_DESCRIPTIONS.json)
    .action((topic, opts) => {
      if (opts.json) {
        console.log(JSON.stringify(getFullReference(program), null, 2))
        return
      }

      switch (topic) {
        case "run":
          printRunHelp()
          break
        case "schema":
          printSchemaHelp()
          break
        default:
          printGeneralHelp()
      }
    })
}

function printGeneralHelp(): void {
  console.log(`
${chalk.bold("CREV")} — AI-powered multi-reviewer code review CLI

${chalk.bold("COMMANDS")}
${formatRows(GENERAL_HELP_COMMANDS.map((entry) => [entry.usage, entry.description]))}

${chalk.bold("QUICK START")}
${formatRows(QUICKSTART_STEPS.map((step) => [step.usage, step.description]))}
`)
}

function printRunHelp(): void {
  const flags = formatRows(RUN_HELP_FLAGS.map((entry) => [entry.flag, entry.description]))
  console.log(`
${chalk.bold("crev run")} — ${COMMAND_DESCRIPTIONS.run}

${chalk.bold("FLAGS")}
${flags}

${chalk.bold("EXAMPLES")}
  crev run --schema quick --base main
  crev run --schema standard --pr 42
  crev run --schema security --reviewers "Security,Architect"
  crev run --schema security --analyze  # Full codebase analysis
  crev run --schema quick --plain --json  # CI mode
  crev run --schema quick --review-file .crev/reviews/existing.json
`)
}

function printSchemaHelp(): void {
  console.log(`
${chalk.bold("SCHEMA FORMAT")}

Schemas define which AI reviewers to run and how. Place them in .crev/schemas/

  File: .crev/schemas/<name>.yaml

  Required fields:
    reviewers:            # List of reviewers to run in parallel
      - name: string      # Display name (e.g., "Security Analyst")
        runtime: string   # AI provider: claude, codex, gemini, kimi, coderabbit, opencode
        model: string     # Model ID or alias

  Optional fields per reviewer:
    prompt: string        # Inline prompt text
    agent: string         # Path to an external agent file (any path)
    timeoutMs: number     # Wall for this lens, overriding reviewers.timeoutMs

  Optional top-level fields:
    description: string   # What this schema reviews for
    triage:               # Secondary review pass
      enabled: boolean
      runtime: string
      model: string

${chalk.bold("SCHEMA COMMANDS")}
  crev schema init <name>          Create a new schema
  crev schema show <name>          Display schema details
  crev schema validate [file]      Validate a schema (or --all)

${chalk.bold("EXAMPLE")}

  # .crev/schemas/security.yaml
  description: Security-focused review
  reviewers:
    - name: Security Analyst
      runtime: claude
      model: opus
      prompt: >
        You are a senior security engineer reviewing code changes.
        Focus on injection vulnerabilities, auth flaws, and secrets exposure.
    - name: Dependency Auditor
      runtime: gemini
      model: gemini-2.5-pro
      agent: ../.claude/agents/dependency-audit.md
    - name: Architecture
      runtime: claude
      model: opus
      prompt: >
        You are a senior software architect reviewing code changes.
        Focus on coupling, abstraction quality, API design, and dependency direction.
  triage:
    enabled: true
    runtime: claude
    model: opus

${chalk.bold("AVAILABLE RUNTIMES")}
`)
  const runtimeEntries = Object.entries(VALID_MODELS)
  const runtimeColWidth = Math.max(...runtimeEntries.map(([name]) => name.length)) + 2
  for (const [runtime, models] of runtimeEntries) {
    console.log(`  ${runtime.padEnd(runtimeColWidth)} Models: ${models.join(", ")}`)
  }
  console.log()
}

function formatRows(rows: ReadonlyArray<readonly [string, string]>): string {
  const col = Math.max(...rows.map(([left]) => left.length)) + 4
  return rows.map(([left, right]) => `  ${left.padEnd(col)}${right}`).join("\n")
}

type CommandReference = {
  name: string
  description: string
  flags: string[]
}

function collectCommandReferences(program: Command): CommandReference[] {
  const collected = new Map<string, CommandReference>()

  function walk(cmd: Command, parentParts: string[]): void {
    for (const child of cmd.commands) {
      const parts = [...parentParts, child.name()]
      const name = parts.join(" ")
      const flags = child.options
        .map((opt) => opt.long)
        .filter((flag): flag is string => Boolean(flag) && flag !== "--help")

      collected.set(name, {
        name,
        description: child.description() || "",
        flags,
      })

      walk(child, parts)
    }
  }

  walk(program, [])

  const ordered: CommandReference[] = []
  for (const name of HELP_COMMAND_ORDER) {
    const entry = collected.get(name)
    if (entry) ordered.push(entry)
  }

  return ordered
}

export function getFullReference(program: Command): Record<string, unknown> {
  return {
    commands: collectCommandReferences(program),
    runtimes: Object.entries(VALID_MODELS).map(([name, models]) => ({ name, models })),
    schemaFormat: {
      required: ["reviewers"],
      reviewerFields: ["name", "runtime", "model", "prompt?", "agent?"],
      triageFields: ["enabled", "runtime", "model", "deduplicate?", "recategorize?"],
    },
  }
}
