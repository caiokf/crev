import type { Command } from "commander"
import chalk from "chalk"
import { Effect, Exit } from "effect"
import { runAction } from "../actions/run.js"
import { RawRunFlags } from "../core/types.js"
import { CliLive } from "../layers.js"
import { exitWithError, extractFailError } from "../util/cli-errors.js"
import { COMMAND_DESCRIPTIONS, COMMON_OPTION_DESCRIPTIONS } from "./metadata.js"

// Re-exported for existing test coverage.
export {
  getReviewerFilterErrorSync as getReviewerFilterError,
  getModelOverrideReviewerErrorSync as getModelOverrideReviewerError,
} from "../actions/run.js"

export function registerRunCommand(program: Command): void {
  program
    .command("run")
    .description(COMMAND_DESCRIPTIONS.run)
    .option("--schema <name>", "Which review schema to use")
    .option("--base <branch>", "Git base branch for diff")
    .option("--base-commit <sha>", "Specific commit hash")
    .option("--type <type>", "Diff type: all, committed, uncommitted")
    .option("--pr <number>", "GitHub PR number")
    .option("--analyze", "Full codebase analysis (no diff)")
    .option("--reviewers <list>", "Comma-separated reviewer names")
    .option(
      "--model <spec>",
      "Override runtime/model (repeatable: runtime/model or Name=runtime/model)",
      (val: string, acc: string[]) => {
        acc.push(val)
        return acc
      },
      [] as string[],
    )
    .option("--slug <name>", "Override artifact name")
    .option("--description <text>", "Metadata description")
    .option("--review-file <path>", "Merge into existing review")
    .option("--plain", "No TUI (CI-friendly)")
    .option("--json", COMMON_OPTION_DESCRIPTIONS.json)
    .option("--prompt-only", "Output prompts as JSON, don't execute")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .action(async (opts: any) => {
      // We load the config once here just to resolve flag defaults;
      // the action loads it again authoritatively. A cheap price to
      // avoid pushing flag→command translation inside the action.
      const { findCrevDir, loadLayeredConfig } = await import("../core/config.js")
      const crevDir = findCrevDir()
      const config = loadLayeredConfig(crevDir)

      const schemaName = opts.schema ?? config.defaults.schema
      if (!schemaName) {
        exitWithError(
          chalk.red("Error: --schema is required (no default configured in config.yaml)"),
        )
      }

      const effectiveBase =
        opts.base ??
        (!opts.pr && !opts.baseCommit && !opts.analyze ? config.defaults.base : undefined)

      const effectiveType = opts.analyze
        ? "all"
        : opts.pr
          ? opts.type ?? "all"
          : opts.type ?? config.defaults.type

      const parsed = RawRunFlags.safeParse({
        schema: schemaName,
        base: effectiveBase,
        baseCommit: opts.baseCommit,
        type: effectiveType,
        analyze: opts.analyze ?? false,
        pr: opts.pr ? Number(opts.pr) : undefined,
        reviewers: opts.reviewers,
        model: opts.model?.length ? opts.model : undefined,
        slug: opts.slug,
        description: opts.description,
        reviewFile: opts.reviewFile,
        plain: opts.plain ?? false,
        json: opts.json ?? false,
        promptOnly: opts.promptOnly ?? false,
      })

      if (!parsed.success) {
        exitWithError(
          chalk.red(`Error: ${parsed.error.issues.map((i) => i.message).join(", ")}`),
        )
      }

      const cmd = parsed.data
      const isQuiet = cmd.output.kind === "json" || cmd.output.kind === "prompt-only"

      const exit = await Effect.runPromiseExit(
        runAction({ command: cmd }).pipe(Effect.provide(CliLive)),
      )

      if (Exit.isFailure(exit)) {
        const err = extractFailError(exit)
        if (err?._tag === "RunCancelledError") {
          console.log(chalk.yellow("Review cancelled. No files saved."))
          return
        }
        if (err?._tag === "RunValidationError") {
          exitWithError(chalk.red(`Error: ${err.reason}`))
        }
        if (err?._tag === "SchemaNotFoundError") {
          exitWithError(chalk.red(`Error: schema "${err.name}" not found`))
        }
        if (err?._tag === "SchemaInvalidError") {
          exitWithError(chalk.red(`Error: ${err.reason}`))
        }
        if (err?._tag === "DiffResolutionError") {
          exitWithError(chalk.red(`Error: failed to generate diff: ${err.reason}`))
        }
        if (err?._tag === "OrchestrationError") {
          exitWithError(chalk.red(`Error: ${err.reason}`))
        }
        exitWithError(chalk.red(`Error: ${err?._tag ?? "unknown"}`))
      }

      const output = exit.value

      if (output.autoSelected && !isQuiet && !cmd.plain) {
        console.log(
          chalk.dim(
            `Auto-selected schema: ${output.autoSelected.schema} (${output.autoSelected.reasoning})`,
          ),
        )
      }

      switch (output.kind) {
        case "empty": {
          if (cmd.output.kind === "json") {
            console.log(JSON.stringify(output.result, null, 2))
          } else {
            console.log("No diff content found. Nothing to review.")
          }
          return
        }
        case "prompt-only": {
          console.log(JSON.stringify(output.prompts, null, 2))
          return
        }
        case "completed": {
          if (cmd.output.kind === "json") {
            console.log(JSON.stringify(output.result, null, 2))
          }
          return
        }
      }
    })
}
