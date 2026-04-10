import type { Command } from "commander"
import chalk from "chalk"
import { getAllRuntimes } from "@crev/runtimes"
import { VALID_MODELS } from "../core/schema.js"

export function registerHelpCommand(program: Command): void {
  program
    .command("help [topic]")
    .description("AI-friendly detailed help")
    .option("--json", "Machine-readable JSON output")
    .action((topic, opts) => {
      if (opts.json) {
        console.log(JSON.stringify(getFullReference(), null, 2))
        return
      }

      switch (topic) {
        case "run":
          printRunHelp()
          break
        case "schema":
          printSchemaHelp()
          break
        case "agents":
          printAgentsHelp()
          break
        default:
          printGeneralHelp()
      }
    })
}

function printGeneralHelp(): void {
  const COL = 46

  const commands: [string, string][] = [
    ["crev run --schema <name>", "Execute a review"],
    ["crev validate [file|--all]", "Validate schemas + agent refs"],
    ["crev list [--schemas|--runtimes|--agents]", "Discover what's available"],
    ["crev show <schema>", "Detail a schema's reviewers"],
    ["crev review <file.json>", "Pretty-print a review artifact"],
    ["crev diff [flags]", "Preview what diff would be reviewed"],
    ["crev doctor [--all] [--json]", "Health check"],
    ["crev schema init <name>", "Scaffold empty schema"],
    ["crev agent init <name>", "Scaffold empty agent persona"],
    ["crev init [path]", "Interactive setup"],
    ["crev update [path]", "Regenerate AI tool skills"],
    ["crev help [run|schema|agents]", "Detailed help"],
  ]

  const quickstart: [string, string][] = [
    ["1. crev init", "Set up .crev/ directory"],
    ["2. crev doctor", "Check runtime health"],
    ["3. crev run --schema quick --base main", "Run your first review"],
  ]

  const fmtRows = (rows: [string, string][]) =>
    rows.map(([cmd, desc]) => `  ${cmd.padEnd(COL)}${desc}`).join("\n")

  console.log(`
${chalk.bold("CREV")} — AI-powered multi-reviewer code review CLI

${chalk.bold("COMMANDS")}
${fmtRows(commands)}

${chalk.bold("QUICK START")}
${fmtRows(quickstart)}
`)
}

function printRunHelp(): void {
  console.log(`
${chalk.bold("crev run")} — Execute a review

${chalk.bold("FLAGS")}
  --schema <name>          Which review schema to use (from .crev/schemas/)
  --base <branch>          Git base branch for diff (default: main)
  --base-commit <sha>      Specific commit hash
  --type <type>            "all" | "committed" | "uncommitted"
  --pr <number>            GitHub PR number
  --reviewers <list>       Comma-separated reviewer names to run
  --slug <name>            Override artifact name
  --description <text>     Metadata
  --review-file <path>     Merge into existing review
  --plain                  No TUI (CI-friendly)
  --json                   Machine-readable JSON output
  --prompt-only            Output prompts as JSON, don't execute

${chalk.bold("EXAMPLES")}
  crev run --schema quick --base main
  crev run --schema standard --pr 42
  crev run --schema security --reviewers "Security,Architect"
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
    agent: string         # Path to agent persona file (relative to .crev/agents/)

  Optional top-level fields:
    description: string   # What this schema reviews for
    triage:               # Secondary review pass
      enabled: boolean
      runtime: string
      model: string
      context: string[]   # Paths to context files

${chalk.bold("EXAMPLE")}

  # .crev/schemas/security.yaml
  description: Security-focused review
  reviewers:
    - name: Security Analyst
      runtime: claude
      model: opus
      agent: security.md
    - name: Dependency Auditor
      runtime: gemini
      model: gemini-2.5-pro
      agent: dependency-audit.md
  triage:
    enabled: true
    runtime: claude
    model: opus

${chalk.bold("AVAILABLE RUNTIMES")}
`)
  for (const [runtime, models] of Object.entries(VALID_MODELS)) {
    console.log(`  ${runtime.padEnd(14)} Models: ${models.join(", ")}`)
  }
  console.log()
}

function printAgentsHelp(): void {
  console.log(`
${chalk.bold("AGENT PERSONAS")}

Agent files live in .crev/agents/ as markdown. They define the reviewer's perspective.

  File: .crev/agents/<name>.md

${chalk.bold("EXAMPLE")}

  # .crev/agents/security.md
  You are a senior security engineer reviewing code changes.

  Focus on:
  - Authentication and authorization flaws
  - Injection vulnerabilities (SQL, XSS, command)
  - Secrets and credential exposure
  - Dependency vulnerabilities
  - Data validation at trust boundaries

  Ignore: style, naming, formatting.

${chalk.bold("REFERENCE")}

  Reference agents in schemas via the "agent" field:
    reviewers:
      - name: Security
        runtime: claude
        model: opus
        agent: security.md
`)
}

function getFullReference(): Record<string, unknown> {
  return {
    commands: [
      { name: "run", description: "Execute a review", flags: ["--schema", "--base", "--pr", "--type", "--reviewers", "--slug", "--description", "--review-file", "--plain", "--json", "--prompt-only"] },
      { name: "validate", description: "Validate schemas", flags: ["--all", "--json"] },
      { name: "list", description: "List schemas/runtimes/agents", flags: ["--schemas", "--runtimes", "--agents", "--json"] },
      { name: "show", description: "Show schema details", flags: ["--json"] },
      { name: "review", description: "Pretty-print review artifact", flags: ["--json"] },
      { name: "diff", description: "Preview diff", flags: ["--base", "--base-commit", "--type", "--pr"] },
      { name: "doctor", description: "Health check", flags: ["--all", "--json"] },
      { name: "schema init", description: "Scaffold empty schema" },
      { name: "agent init", description: "Scaffold empty agent" },
      { name: "init", description: "Interactive setup" },
      { name: "help", description: "Show help", flags: ["--json"] },
    ],
    runtimes: Object.entries(VALID_MODELS).map(([name, models]) => ({ name, models })),
    schemaFormat: {
      required: ["reviewers"],
      reviewerFields: ["name", "runtime", "model", "prompt?", "agent?"],
      triageFields: ["enabled", "runtime", "model", "context?"],
    },
  }
}
