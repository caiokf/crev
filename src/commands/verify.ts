import type { Command } from "commander"
import chalk from "chalk"
import path from "node:path"
import { Effect } from "effect"
import { verifyAction } from "../actions/verify.js"
import { CliLive } from "../layers.js"
import { exitWithError, errorMessage } from "../util/cli-errors.js"
import { COMMAND_DESCRIPTIONS } from "./metadata.js"

type VerifyOptions = {
  json?: boolean
}

export function registerVerifyCommand(program: Command): void {
  program
    .command("verify [file]")
    .description(COMMAND_DESCRIPTIONS.verify)
    .option("--json", "Machine-readable JSON output")
    .action(async (file: string | undefined, opts: VerifyOptions) => {
      const result = await Effect.runPromise(
        verifyAction({ filePath: file }).pipe(Effect.provide(CliLive)),
      ).catch((err) => {
        exitWithError(
          chalk.red(
            `Verify failed: ${errorMessage(err)}`,
          ),
        )
      })

      if (!result) return

      if (opts.json) {
        console.log(
          JSON.stringify(
            {
              filePath: result.filePath,
              durationMs: result.durationMs,
              summary: result.summary,
              statuses: result.statuses,
            },
            null,
            2,
          ),
        )
        return
      }

      const relPath = path.relative(process.cwd(), result.filePath)
      console.log()
      console.log(`  ${chalk.bold("Verified")} ${chalk.dim(relPath)}`)
      console.log(
        `  ${chalk.dim(`${(result.durationMs / 1000).toFixed(1)}s`)}`
      )
      console.log()

      if (result.statuses.length === 0) {
        console.log(`  ${chalk.dim("No open issues to verify.")}`)
      } else {
        for (const s of result.statuses) {
          const icon =
            s.status === "fixed"
              ? chalk.green("✓ fixed")
              : chalk.yellow("● open ")
          console.log(`  ${icon}  ${s.id}`)
          if (s.reasoning) {
            console.log(`         ${chalk.dim(s.reasoning)}`)
          }
        }
      }

      console.log()
      console.log(
        `  ${chalk.green(`${result.summary.fixed} fixed`)} · ` +
          `${chalk.yellow(`${result.summary.open} open`)}` +
          (result.summary.skipped > 0
            ? ` · ${chalk.dim(`${result.summary.skipped} skipped`)}`
            : ""),
      )
      console.log()
    })
}
