import crypto from "node:crypto"
import { execSync } from "node:child_process"
import fs from "node:fs"
import type { Command } from "commander"
import chalk from "chalk"
import { autoSelectSchema } from "../core/schema-auto-select.js"
import { findCrevDir, loadLayeredConfig } from "../core/config.js"
import { cleanupDiffFile, resolveDiff } from "../core/diff.js"
import { buildPromptOnlyResult, orchestrate } from "../core/orchestrator.js"
import { loadSchemaFile, resolveSchemaPath, type SchemaFileType } from "../core/schema.js"
import { RawRunFlags, UserCancelledError, type ReviewResult, type RunCommand } from "../core/types.js"
import path from "node:path"
import { errorMessage, exitWithError } from "../util/cli-errors.js"

export function registerRunCommand(program: Command): void {
  program
    .command("run")
    .description("Execute a review")
    .option("--schema <name>", "Which review schema to use")
    .option("--base <branch>", "Git base branch for diff")
    .option("--base-commit <sha>", "Specific commit hash")
    .option("--type <type>", "Diff type: all, committed, uncommitted")
    .option("--pr <number>", "GitHub PR number")
    .option("--analyze", "Full codebase analysis (no diff)")
    .option("--reviewers <list>", "Comma-separated reviewer names")
    .option("--slug <name>", "Override artifact name")
    .option("--description <text>", "Metadata description")
    .option("--review-file <path>", "Merge into existing review")
    .option("--plain", "No TUI (CI-friendly)")
    .option("--json", "Machine-readable JSON output")
    .option("--prompt-only", "Output prompts as JSON, don't execute")
    .action(async (opts) => {
      const crevDir = findCrevDir()
      const config = loadLayeredConfig(crevDir)

      const schemaName = opts.schema ?? config.defaults.schema
      if (!schemaName) {
        exitWithError(chalk.red("Error: --schema is required (no default configured in config.yaml)"))
      }

      const effectiveBase = opts.base
        ?? (!opts.pr && !opts.baseCommit && !opts.analyze ? config.defaults.base : undefined)

      const effectiveType = opts.analyze
        ? "all"
        : opts.pr
          ? (opts.type ?? "all")
          : (opts.type ?? config.defaults.type)

      const parsed = RawRunFlags.safeParse({
        schema: schemaName,
        base: effectiveBase,
        baseCommit: opts.baseCommit,
        type: effectiveType,
        analyze: opts.analyze ?? false,
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
        exitWithError(chalk.red(`Error: ${parsed.error.issues.map((i) => i.message).join(", ")}`))
      }

      const cmd = parsed.data

      let resolvedSchemaName = cmd.schema
      if (cmd.schema === "auto") {
        try {
          const selection = await autoSelectSchema(crevDir, config, cmd.diff, cmd.analyze)
          resolvedSchemaName = selection.schema
          if (!cmd.plain && cmd.output.kind !== "json" && cmd.output.kind !== "prompt-only") {
            console.log(chalk.dim(`Auto-selected schema: ${resolvedSchemaName} (${selection.reasoning})`))
          }
        } catch (err) {
          const reason = errorMessage(err)
          exitWithError(chalk.red(`Error: auto schema selection failed: ${reason}`))
        }
      }

      const schemaPath = resolveSchemaPath(resolvedSchemaName, crevDir)
      if (!schemaPath) {
        exitWithError(chalk.red(`Error: schema "${resolvedSchemaName}" not found`))
      }
      const schemaRaw = fs.readFileSync(schemaPath, "utf-8")
      const schemaHash = crypto.createHash("sha256").update(schemaRaw).digest("hex").slice(0, 8)
      let schema: SchemaFileType
      try {
        schema = loadSchemaFile(schemaPath, config.aliases)
      } catch (err) {
        const reason = errorMessage(err)
        exitWithError(chalk.red(`Error: ${reason}`))
      }

      const reviewerFilterError = getReviewerFilterError(schema, cmd.reviewers)
      if (reviewerFilterError) {
        exitWithError(chalk.red(`Error: ${reviewerFilterError}`))
      }

      const slug = cmd.target.kind === "fresh" ? (cmd.target.slug ?? generateSlug()) : path.basename(cmd.target.reviewFile, ".json")

      let diff
      try {
        diff = await resolveDiff({
          slug,
          source: cmd.diff,
          analyze: cmd.analyze,
          exclude: config.diff.exclude,
          crevDir,
        })
      } catch (err) {
        const reason = errorMessage(err)
        exitWithError(chalk.red(`Error: failed to generate diff: ${reason}`))
      }

      if (!diff.diffContent.trim() && cmd.output.kind !== "prompt-only") {
        cleanupDiffFile(diff)
        if (cmd.output.kind === "json") {
          console.log(JSON.stringify(buildEmptyResult(resolvedSchemaName, schemaHash, slug, cmd, diff.type), null, 2))
        } else {
          console.log("No diff content found. Nothing to review.")
        }
        return
      }

      const orchestrateOpts = {
        schema,
        schemaName: resolvedSchemaName,
        schemaHash,
        config,
        diff,
        slug,
        crevDir,
        reviewerFilter: cmd.reviewers,
        analyze: cmd.analyze,
        output: cmd.output,
        target: cmd.target,
      }

      if (cmd.output.kind === "prompt-only") {
        try {
          const promptPreview = buildPromptOnlyResult(orchestrateOpts)
          console.log(JSON.stringify(promptPreview, null, 2))
          return
        } catch (err) {
          const reason = errorMessage(err)
          exitWithError(chalk.red(`Error: ${reason}`))
        } finally {
          cleanupDiffFile(diff)
        }
      }

      let result
      try {
        result = await orchestrate(orchestrateOpts)
      } catch (err) {
        cleanupDiffFile(diff)
        if (err instanceof UserCancelledError) {
          console.log(chalk.yellow("Review cancelled. No files saved."))
          return
        }
        const reason = errorMessage(err)
        exitWithError(chalk.red(`Error: ${reason}`))
      }

      if (cmd.output.kind === "json") {
        console.log(JSON.stringify(result, null, 2))
      }
    })
}

export function getReviewerFilterError(schema: SchemaFileType, reviewerFilter?: string[]): string | null {
  if (!reviewerFilter || reviewerFilter.length === 0) return null

  const normalized = reviewerFilter.map((r) => r.toLowerCase().trim()).filter(Boolean)
  if (normalized.length === 0 || normalized.includes("all")) return null

  const schemaReviewers = schema.reviewers.map((r) => r.name)
  const schemaReviewersSet = new Set(schemaReviewers.map((r) => r.toLowerCase()))
  const hasMatch = normalized.some((name) => schemaReviewersSet.has(name))
  if (hasMatch) return null

  return `No reviewers matched --reviewers. Available reviewers: ${schemaReviewers.join(", ")}`
}

function buildEmptyResult(
  schema: string,
  schemaHash: string,
  slug: string,
  cmd: RunCommand,
  diffType: string,
): ReviewResult {
  return {
    metadata: {
      slug,
      timestamp: new Date().toISOString(),
      schema,
      schemaHash,
      diffBase: cmd.diff.kind === "branch" ? cmd.diff.base : undefined,
      diffType,
      description: cmd.target.kind === "fresh" ? cmd.target.description : undefined,
    },
    reviews: [],
    summary: {
      totalIssues: 0,
      bySeverity: {},
      byCategory: {},
      byReviewer: {},
    },
  }
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
