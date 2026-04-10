import type { Command } from "commander"
import chalk from "chalk"
import { findCrevDir, loadConfig } from "../core/config.js"
import { resolveDiff, cleanupDiffFile } from "../core/diff.js"
import type { DiffSource } from "../core/types.js"

export function registerDiffCommand(program: Command): void {
  program
    .command("diff")
    .description("Preview what diff would be reviewed (dry-run)")
    .option("--base <branch>", "Git base branch for diff")
    .option("--base-commit <sha>", "Specific commit hash")
    .option("--type <type>", "Diff type: all, committed, uncommitted, current-state", "all")
    .option("--pr <number>", "GitHub PR number")
    .action(async (opts) => {
      const specified = [opts.pr, opts.base, opts.baseCommit].filter(Boolean).length
      if (specified > 1) {
        console.error("Error: --pr, --base, and --base-commit are mutually exclusive")
        process.exit(1)
      }

      if (opts.type === "current-state" && (opts.base || opts.baseCommit || opts.pr)) {
        console.error("Error: --type current-state cannot be combined with --base, --base-commit, or --pr")
        process.exit(1)
      }

      const crevDir = findCrevDir()
      const config = loadConfig(crevDir)

      const source: DiffSource = opts.pr
        ? { kind: "pr", pr: Number(opts.pr) }
        : opts.baseCommit
          ? { kind: "commit", baseCommit: opts.baseCommit, type: opts.type }
          : opts.base
            ? { kind: "branch", base: opts.base, type: opts.type }
            : { kind: "local", type: opts.type }

      const diff = await resolveDiff({
        slug: "preview",
        source,
        exclude: config.diff.exclude,
        crevDir,
      })

      const lines = diff.diffContent.split("\n").length
      console.log(chalk.bold(`Diff: ${lines} lines`))
      console.log()
      console.log(diff.diffContent)

      cleanupDiffFile(diff)
    })
}
