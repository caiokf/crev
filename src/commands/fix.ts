import type { Command } from "commander"
import chalk from "chalk"
import path from "node:path"
import { Effect } from "effect"
import { fixAction } from "../actions/fix.js"
import { CliLive } from "../layers.js"
import { exitWithError, errorMessage } from "../util/cli-errors.js"
import { COMMAND_DESCRIPTIONS } from "./metadata.js"

type FixOptions = {
  issue?: string
  includeDeferred?: boolean
  model?: string
  json?: boolean
}

export function registerFixCommand(program: Command): void {
  program
    .command("fix [file]")
    .description(COMMAND_DESCRIPTIONS.fix)
    .option("--issue <id>", "Fix a single issue by ID")
    .option("--include-deferred", "Include deferred issues (default: actionable only)")
    .option("--model <spec>", "Override runtime/model (format: runtime/model)")
    .option("--json", "Machine-readable JSON output")
    .action(async (file: string | undefined, opts: FixOptions) => {
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
        fixAction({
          filePath: file,
          issueId: opts.issue,
          includeDeferred: opts.includeDeferred,
          runtime,
          model,
          onProgress: opts.json
            ? undefined
            : (completed, total, status) => {
                const icon =
                  status.status === "fixed"
                    ? chalk.green("✓")
                    : status.status === "failed"
                      ? chalk.red("✗")
                      : chalk.dim("–")
                process.stderr.write(
                  `  ${icon} [${completed}/${total}] ${status.id}\r\n`,
                )
              },
        }).pipe(Effect.provide(CliLive)),
      ).catch((err) => {
        exitWithError(
          chalk.red(
            `Fix failed: ${errorMessage(err)}`,
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
      console.log(`  ${chalk.bold("Fixed")} ${chalk.dim(relPath)}`)
      console.log(
        `  ${chalk.dim(`${(result.durationMs / 1000).toFixed(1)}s`)}`,
      )
      console.log()

      if (result.statuses.length === 0) {
        console.log(`  ${chalk.dim("No eligible issues to fix.")}`)
      } else {
        for (const s of result.statuses) {
          const icon =
            s.status === "fixed"
              ? chalk.green("✓ fixed ")
              : s.status === "failed"
                ? chalk.red("✗ failed")
                : chalk.dim("– skip  ")
          console.log(`  ${icon}  ${s.id}`)
          if (s.reasoning) {
            console.log(`           ${chalk.dim(s.reasoning)}`)
          }
        }
      }

      console.log()
      console.log(
        `  ${chalk.green(`${result.summary.fixed} fixed`)} · ` +
          `${chalk.red(`${result.summary.failed} failed`)}` +
          (result.summary.skipped > 0
            ? ` · ${chalk.dim(`${result.summary.skipped} skipped`)}`
            : ""),
      )
      console.log()
    })
}
