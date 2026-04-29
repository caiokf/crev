import type { Command } from "commander"
import chalk from "chalk"
import { Effect, Exit } from "effect"
import { diffAction } from "../actions/diff.js"
import { RawDiffFlags } from "../core/types.js"
import { CliLive } from "../layers.js"
import { exitWithError, extractFailError } from "../util/cli-errors.js"
import { COMMAND_DESCRIPTIONS } from "./metadata.js"

type DiffOptions = {
  base?: string
  baseCommit?: string
  type?: string
  pr?: string
}

export function registerDiffCommand(program: Command): void {
  program
    .command("diff")
    .description(COMMAND_DESCRIPTIONS.diff)
    .option("--base <branch>", "Git base branch for diff")
    .option("--base-commit <sha>", "Specific commit hash")
    .option("--type <type>", "Diff type: all, committed, uncommitted", "all")
    .option("--pr <number>", "GitHub PR number")
    .action(async (opts: DiffOptions) => {
      const parsed = RawDiffFlags.safeParse({
        base: opts.base,
        baseCommit: opts.baseCommit,
        pr: opts.pr,
        type: opts.type,
      })
      if (!parsed.success) {
        exitWithError(chalk.red(`Error: ${parsed.error.issues.map((i) => i.message).join(", ")}`))
      }

      const exit = await Effect.runPromiseExit(
        diffAction({ source: parsed.data }).pipe(Effect.provide(CliLive)),
      )

      if (Exit.isFailure(exit)) {
        const err = extractFailError(exit)
        if (err?._tag === "DiffResolutionError") {
          exitWithError(chalk.red(`Error: failed to generate diff: ${err.reason}`))
        }
        exitWithError(chalk.red(`Error: ${err?._tag ?? "unknown"}`))
      }

      const { diff, cleanup } = exit.value
      const lines = diff.diffContent.split("\n").length
      console.log(chalk.bold(`Diff: ${lines} lines`))
      console.log()
      console.log(diff.diffContent)

      cleanup()
    })
}
