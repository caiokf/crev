import crypto from "node:crypto"
import { execSync } from "node:child_process"
import fs from "node:fs"
import type { Command } from "commander"
import chalk from "chalk"
import { findCrevDir, loadConfig } from "../core/config.js"
import { resolveDiff } from "../core/diff.js"
import { orchestrate } from "../core/orchestrator.js"
import { loadSchemaFile } from "../core/schema.js"
import { RawRunFlags } from "../core/types.js"
import { getSchemasDir } from "../util/paths.js"
import path from "node:path"

export function registerRunCommand(program: Command): void {
  program
    .command("run")
    .description("Execute a review")
    .option("--schema <name>", "Which review schema to use")
    .option("--base <branch>", "Git base branch for diff")
    .option("--base-commit <sha>", "Specific commit hash")
    .option("--type <type>", "Diff type: all, committed, uncommitted, current-state", "all")
    .option("--pr <number>", "GitHub PR number")
    .option("--reviewers <list>", "Comma-separated reviewer names")
    .option("--slug <name>", "Override artifact name")
    .option("--description <text>", "Metadata description")
    .option("--review-file <path>", "Merge into existing review")
    .option("--plain", "No TUI (CI-friendly)")
    .option("--json", "Machine-readable JSON output")
    .option("--prompt-only", "Output prompts as JSON, don't execute")
    .action(async (opts) => {
      const crevDir = findCrevDir()
      const config = loadConfig(crevDir)

      const schemaName = opts.schema ?? config.defaults.schema
      if (!schemaName) {
        console.error(chalk.red("Error: --schema is required (no default configured in config.yaml)"))
        process.exit(1)
      }

      const parsed = RawRunFlags.safeParse({
        schema: schemaName,
        base: opts.base,
        baseCommit: opts.baseCommit,
        type: opts.type,
        pr: opts.pr ? Number(opts.pr) : undefined,
        reviewers: opts.reviewers,
        slug: opts.slug,
        description: opts.description,
        reviewFile: opts.reviewFile,
        plain: opts.plain ?? false,
        json: opts.json ?? false,
        promptOnly: opts.promptOnly ?? false,
      })

      if (!parsed.success) {
        console.error(chalk.red(`Error: ${parsed.error.issues.map((i) => i.message).join(", ")}`))
        process.exit(1)
      }

      const cmd = parsed.data

      const schemaPath = path.join(getSchemasDir(crevDir), `${cmd.schema}.yaml`)
      const schemaRaw = fs.readFileSync(schemaPath, "utf-8")
      const schemaHash = crypto.createHash("sha256").update(schemaRaw).digest("hex").slice(0, 8)
      const schema = loadSchemaFile(schemaPath)

      const slug = cmd.target.kind === "fresh" ? (cmd.target.slug ?? generateSlug()) : path.basename(cmd.target.reviewFile, ".json")

      const diff = await resolveDiff({
        slug,
        source: cmd.diff,
        exclude: config.diff.exclude,
        crevDir,
      })

      if (!diff.diffContent.trim()) {
        console.log("No diff content found. Nothing to review.")
        return
      }

      const result = await orchestrate({
        schema,
        schemaName: cmd.schema,
        schemaHash,
        config,
        diff,
        slug,
        crevDir,
        description: cmd.target.kind === "fresh" ? cmd.target.description : undefined,
        reviewerFilter: cmd.reviewers,
        plain: cmd.plain || cmd.output.kind === "plain",
        promptOnly: cmd.output.kind === "prompt-only",
        reviewFile: cmd.target.kind === "merge" ? cmd.target.reviewFile : undefined,
      })

      if (cmd.output.kind === "prompt-only" || cmd.output.kind === "json") {
        console.log(JSON.stringify(result, null, 2))
      }
    })
}

function generateSlug(): string {
  try {
    const branch = execSync("git rev-parse --abbrev-ref HEAD", { encoding: "utf-8" }).trim()
    return branch
      .replace(/[^a-zA-Z0-9-]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 50)
  } catch {
    return "review"
  }
}
