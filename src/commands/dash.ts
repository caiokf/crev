import type { Command } from "commander"
import chalk from "chalk"
import { exitWithError } from "../util/cli-errors.js"
import { COMMAND_DESCRIPTIONS } from "./metadata.js"

export function registerDashCommand(program: Command): void {
  program
    .command("dash")
    .description(COMMAND_DESCRIPTIONS.dash)
    .action(async () => {
      if (!process.stdout.isTTY) {
        exitWithError(
          chalk.red(
            "Error: `crev dash` requires an interactive TTY. Use `crev list`, `crev show`, or `crev run` in non-TTY environments.",
          ),
        )
      }
      try {
        // Lazy-load the dash entrypoint so non-dash commands (and
        // `crev --version`) don't have to pay the blessed init cost
        // or risk its dynamic-require hazards in standalone binaries.
        const { runDash } = await import("../dash/index.js")
        await runDash()
      } catch (err) {
        exitWithError(chalk.red(`Error: ${err instanceof Error ? err.message : String(err)}`))
      }
    })
}
