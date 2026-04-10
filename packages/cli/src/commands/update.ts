import path from "node:path"
import fs from "node:fs"
import type { Command } from "commander"
import chalk from "chalk"
import { detectAITools, type AITool } from "../util/detect-tools.js"
import { claudeSkill } from "../templates/skills/claude.js"
import { cursorSkill } from "../templates/skills/cursor.js"
import { copilotPrompt } from "../templates/skills/copilot.js"

export function registerUpdateCommand(program: Command): void {
  program
    .command("update [path]")
    .description("Regenerate AI tool skills (preserves schemas and agents)")
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
        writeSkill(projectRoot, tool)
      }

      console.log()
      console.log(chalk.green("Done.") + " Skills regenerated for: " + detected.map((t) => t.name).join(", "))
    })
}

function writeSkill(projectRoot: string, tool: AITool): void {
  const skillContent = getSkillContent(tool.id)
  if (!skillContent) return

  if (tool.id === "claude" || tool.id === "cursor" || tool.id === "windsurf" || tool.id === "opencode") {
    const skillDir = path.join(projectRoot, tool.skillPath)
    fs.mkdirSync(skillDir, { recursive: true })
    const filePath = path.join(skillDir, "SKILL.md")
    fs.writeFileSync(filePath, skillContent, "utf-8")
    console.log(`  ${chalk.green("✓")} Updated ${path.relative(process.cwd(), filePath)}`)
  } else if (tool.id === "copilot") {
    const promptDir = path.join(projectRoot, tool.skillPath)
    fs.mkdirSync(promptDir, { recursive: true })
    const filePath = path.join(promptDir, "crev.prompt.md")
    fs.writeFileSync(filePath, skillContent, "utf-8")
    console.log(`  ${chalk.green("✓")} Updated ${path.relative(process.cwd(), filePath)}`)
  }
}

function getSkillContent(toolId: string): string | null {
  switch (toolId) {
    case "claude":
      return claudeSkill
    case "cursor":
    case "windsurf":
    case "opencode":
      return cursorSkill
    case "copilot":
      return copilotPrompt
    default:
      return null
  }
}
