export const ROOT_PROGRAM_DESCRIPTION = "AI-powered multi-reviewer code review CLI"

export const COMMON_OPTION_DESCRIPTIONS = {
  json: "Machine-readable JSON output",
} as const

export const COMMAND_DESCRIPTIONS = {
  run: "Execute a review",
  show: "Pretty-print a review artifact (default: latest)",
  diff: "Preview what diff would be reviewed (dry-run)",
  stats: "Aggregate review statistics across runs",
  config: "Show resolved configuration with source annotations",
  doctor: "Health check for runtimes and schemas",
  list: "Discover schemas and runtimes",
  schema: "Schema management",
  schemaInit: "Scaffold an empty schema",
  schemaShow: "Display schema details",
  schemaValidate: "Validate schemas",
  init: "Interactive TUI setup",
  update: "Regenerate AI tool skills",
  help: "AI-friendly detailed help",
} as const

export type CommandPath =
  | "run"
  | "show"
  | "diff"
  | "stats"
  | "config"
  | "doctor"
  | "list"
  | "schema init"
  | "schema show"
  | "schema validate"
  | "init"
  | "update"
  | "help"

export const HELP_COMMAND_ORDER: readonly CommandPath[] = [
  "run",
  "show",
  "diff",
  "stats",
  "config",
  "doctor",
  "list",
  "schema init",
  "schema show",
  "schema validate",
  "init",
  "update",
  "help",
]

export const GENERAL_HELP_COMMANDS: readonly Array<{ usage: string; description: string }> = [
  { usage: "crev run --schema <name>", description: COMMAND_DESCRIPTIONS.run },
  { usage: "crev show [file.json]", description: "Pretty-print a review (default: latest)" },
  { usage: "crev diff [flags]", description: "Preview what diff would be reviewed" },
  { usage: "crev stats", description: "Aggregate stats across reviews" },
  { usage: "crev config [--layers]", description: "Show resolved configuration" },
  { usage: "crev doctor [--all] [--json] [--ping]", description: "Health check" },
  { usage: "crev list [--schemas|--runtimes]", description: "Discover what's available" },
  { usage: "crev schema init <name>", description: COMMAND_DESCRIPTIONS.schemaInit },
  { usage: "crev schema show <name>", description: COMMAND_DESCRIPTIONS.schemaShow },
  { usage: "crev schema validate [file] [--all]", description: COMMAND_DESCRIPTIONS.schemaValidate },
  { usage: "crev init [path]", description: "Interactive setup" },
  { usage: "crev update [path]", description: COMMAND_DESCRIPTIONS.update },
  { usage: "crev help [run|schema]", description: "Detailed help" },
]

export const QUICKSTART_STEPS: readonly Array<{ usage: string; description: string }> = [
  { usage: "1. crev init", description: "Set up .crev/ directory" },
  { usage: "2. crev doctor", description: "Check runtime health" },
  { usage: "3. crev run --schema quick --base main", description: "Run your first review" },
]

export const RUN_HELP_FLAGS: readonly Array<{ flag: string; description: string }> = [
  { flag: "--schema <name>", description: "Which review schema to use (from .crev/schemas/)" },
  { flag: "--base <branch>", description: "Git base branch for diff" },
  { flag: "--base-commit <sha>", description: "Specific commit hash" },
  { flag: "--type <type>", description: "\"all\" | \"committed\" | \"uncommitted\"" },
  { flag: "--pr <number>", description: "GitHub PR number" },
  { flag: "--analyze", description: "Full codebase analysis (no diff)" },
  { flag: "--reviewers <list>", description: "Comma-separated reviewer names to run" },
  { flag: "--slug <name>", description: "Override artifact name" },
  { flag: "--description <text>", description: "Metadata" },
  { flag: "--review-file <path>", description: "Merge into existing review" },
  { flag: "--plain", description: "No TUI (CI-friendly)" },
  { flag: "--json", description: COMMON_OPTION_DESCRIPTIONS.json },
  { flag: "--prompt-only", description: "Output prompts as JSON, don't execute" },
]

