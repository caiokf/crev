import type { Command } from "commander"
import chalk from "chalk"
import { findCrevDir, loadLayeredConfig } from "../core/config.js"
import { resolveDiff, cleanupDiffFile } from "../core/diff.js"
import { RawDiffFlags } from "../core/types.js"
import { exitWithError } from "../util/cli-errors.js"

export function registerDiffCommand(program: Command): void {
  program
    .command("diff")
    .description("Preview what diff would be reviewed (dry-run)")
    .option("--base <branch>", "Git base branch for diff")
    .option("--base-commit <sha>", "Specific commit hash")
    .option("--type <type>", "Diff type: all, committed, uncommitted", "all")
    .option("--pr <number>", "GitHub PR number")
    .action(async (opts) => {
      const parsed = RawDiffFlags.safeParse({
        base: opts.base,
        baseCommit: opts.baseCommit,
        pr: opts.pr,
        type: opts.type,
      })
      if (!parsed.success) {
        exitWithError(chalk.red(`Error: ${parsed.error.issues.map((i) => i.message).join(", ")}`))
      }

      const crevDir = findCrevDir()
      const config = loadLayeredConfig(crevDir)
      const source = parsed.data

      let diff
      try {
        diff = await resolveDiff({
          slug: "preview",
          source,
          exclude: config.diff.exclude,
          crevDir,
        })
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err)
        exitWithError(chalk.red(`Error: failed to generate diff: ${reason}`))
      }

      const lines = diff.diffContent.split("\n").length
      console.log(chalk.bold(`Diff: ${lines} lines`))
      console.log()
      console.log(diff.diffContent)

      cleanupDiffFile(diff)
    })
}
