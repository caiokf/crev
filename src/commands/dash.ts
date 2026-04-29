import path from "node:path"
import type { Command } from "commander"
import chalk from "chalk"
import { exitWithError, errorMessage } from "../util/cli-errors.js"
import type { DashRoute } from "../dash/types.js"
import { COMMAND_DESCRIPTIONS } from "./metadata.js"

type DashOptions = {
  issue?: string
}

/**
 * Build the initial router stack from `[file]` + `--issue` CLI args.
 *
 * - No file: land on `home` (default behavior).
 * - File only: deep-link into `run-detail`, with `home → runs` seeded
 *   underneath so `[bksp]` still walks back through the full nav path.
 * - File + `--issue`: deep-link into `issue-detail` on top of the
 *   same base stack.
 *
 * Exported for unit tests — the CLI action is a thin shim over this.
 */
export function buildInitialStack(
  file: string | undefined,
  opts: DashOptions,
  cwd: string = process.cwd(),
): readonly DashRoute[] {
  if (!file) {
    if (opts.issue) {
      throw new Error("--issue requires a review file (usage: crev dash <file> --issue <id>)")
    }
    return [{ kind: "home" }]
  }
  const filePath = path.resolve(cwd, file)
  const base: DashRoute[] = [
    { kind: "home" },
    { kind: "runs" },
    { kind: "run-detail", filePath },
  ]
  if (opts.issue) {
    base.push({ kind: "issue-detail", filePath, issueId: opts.issue })
  }
  return base
}

export function registerDashCommand(program: Command): void {
  program
    .command("dash [file]")
    .description(COMMAND_DESCRIPTIONS.dash)
    .option(
      "--issue <id>",
      "deep-link into a specific issue by id (requires [file])",
    )
    .action(async (file: string | undefined, opts: DashOptions) => {
      if (!process.stdout.isTTY) {
        exitWithError(
          chalk.red(
            "Error: `crev dash` requires an interactive TTY. Use `crev list`, `crev show`, or `crev run` in non-TTY environments.",
          ),
        )
      }
      let initialRoute: readonly DashRoute[]
      try {
        initialRoute = buildInitialStack(file, opts)
      } catch (err) {
        exitWithError(chalk.red(`Error: ${errorMessage(err)}`))
        return
      }
      try {
        // Lazy-load the dash entrypoint so non-dash commands (and
        // `crev --version`) don't have to pay the blessed init cost
        // or risk its dynamic-require hazards in standalone binaries.
        const { runDash } = await import("../dash/index.js")
        await runDash({ initialRoute })
      } catch (err) {
        exitWithError(chalk.red(`Error: ${errorMessage(err)}`))
      }
    })
}
