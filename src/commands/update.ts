import path from "node:path"
import fs from "node:fs"
import type { Command } from "commander"
import chalk from "chalk"
import { detectAITools } from "../util/detect-tools.js"
import { writeSkill } from "../util/skills.js"

export function registerUpdateCommand(program: Command): void {
  program
    .command("update [path]")
    .description("Regenerate AI tool skills")
    .action(async (initPath) => {
      const projectRoot = initPath ? path.resolve(initPath) : process.cwd()
      const crevDir = path.join(projectRoot, ".crev")

      if (!fs.existsSync(crevDir)) {
        console.error(chalk.red("No .crev directory found. Run `crev init` first."))
        process.exit(1)
      }

      const tools = detectAITools(projectRoot)
      const detected = tools.filter((t) => t.detected)

      if (detected.length === 0) {
        console.log(chalk.yellow("No AI tools detected in this project."))
        return
      }

      console.log(chalk.dim("Updating skills for detected AI tools..."))
      console.log()

      for (const tool of detected) {
        writeSkill(projectRoot, tool, true)
      }

      console.log()
      console.log(chalk.green("Done.") + " Skills regenerated for: " + detected.map((t) => t.name).join(", "))
    })
}
