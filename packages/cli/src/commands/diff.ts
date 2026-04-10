import type { Command } from "commander"
import { findCrevDir, loadConfig } from "../core/config.js"
import { resolveDiff, cleanupDiffFile } from "../core/diff.js"
import type { DiffSource } from "../core/types.js"

export function registerDiffCommand(program: Command): void {
  program
    .command("diff")
    .description("Preview what diff would be reviewed (dry-run)")
    .option("--base <branch>", "Git base branch for diff")
    .option("--base-commit <sha>", "Specific commit hash")
    .option("--type <type>", "Diff type: all, committed, uncommitted", "all")
    .option("--pr <number>", "GitHub PR number")
    .action(async (opts) => {
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
      console.log(`Diff: ${lines} lines`)
      console.log()
      console.log(diff.diffContent)

      cleanupDiffFile(diff)
    })
}
