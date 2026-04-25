import type { Command } from "commander"
import chalk from "chalk"
import path from "node:path"
import { Effect } from "effect"
import { triageAction } from "../actions/triage.js"
import { CliLive } from "../layers.js"
import { exitWithError, errorMessage } from "../util/cli-errors.js"
import { COMMAND_DESCRIPTIONS } from "./metadata.js"

type TriageOptions = {
  model?: string
  json?: boolean
}

export function registerTriageCommand(program: Command): void {
  program
    .command("triage [file]")
    .description(COMMAND_DESCRIPTIONS.triage)
    .option("--model <spec>", "Override runtime/model (format: runtime/model)")
    .option("--json", "Machine-readable JSON output")
    .action(async (file: string | undefined, opts: TriageOptions) => {
      let runtime: string | undefined
      let model: string | undefined

      if (opts.model) {
        const slashIndex = opts.model.indexOf("/")
        if (slashIndex === -1) {
          exitWithError(chalk.red(`Invalid --model format "${opts.model}". Expected "runtime/model"`))
          return
        }
        runtime = opts.model.slice(0, slashIndex)
        model = opts.model.slice(slashIndex + 1)
        if (!runtime || !model) {
          exitWithError(chalk.red(`Invalid --model format "${opts.model}". Expected "runtime/model"`))
          return
        }
      }

      const result = await Effect.runPromise(
        triageAction({
          filePath: file,
          runtime,
          model,
        }).pipe(Effect.provide(CliLive)),
      ).catch((err) => {
        exitWithError(
          chalk.red(
            `Triage failed: ${errorMessage(err)}`,
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
            },
            null,
            2,
          ),
        )
        return
      }

      const relPath = path.relative(process.cwd(), result.filePath)
      console.log()
      console.log(`  ${chalk.bold("Triaged")} ${chalk.dim(relPath)}`)
      console.log(
        `  ${chalk.dim(`${(result.durationMs / 1000).toFixed(1)}s`)}`,
      )
      console.log()
      console.log(
        `  ${chalk.green(`${result.summary.actionable} actionable`)} · ` +
          `${chalk.yellow(`${result.summary.deferred} deferred`)} · ` +
          `${chalk.dim(`${result.summary.dismissed} dismissed`)}`,
      )
      console.log()
    })
}
