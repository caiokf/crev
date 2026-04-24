import path from "node:path"
import fs from "node:fs"
import type { Command } from "commander"
import chalk from "chalk"
import { getInstalledSkills, writeSkill } from "../util/skills.js"
import { exitWithError } from "../util/cli-errors.js"
import { COMMAND_DESCRIPTIONS } from "./metadata.js"

export function registerUpdateCommand(program: Command): void {
  program
    .command("update [path]")
    .description(COMMAND_DESCRIPTIONS.update)
    .action(async (initPath) => {
      const projectRoot = initPath ? path.resolve(initPath) : process.cwd()
      const crevDir = path.join(projectRoot, ".crev")

      if (!fs.existsSync(crevDir)) {
        exitWithError(chalk.red("No .crev directory found. Run `crev init` first."))
      }

      const installed = getInstalledSkills(projectRoot)

      if (installed.length === 0) {
        console.log(chalk.yellow("No installed crev skills found. Run `crev init` first."))
        return
      }

      console.log(chalk.dim("Updating skills for installed tools..."))
      console.log()

      for (const tool of installed) {
        writeSkill(projectRoot, tool, true)
      }

      console.log()
      console.log(chalk.green("Done.") + " Skills regenerated for: " + installed.map((t) => t.name).join(", "))
    })
}
