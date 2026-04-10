import fs from "node:fs"
import path from "node:path"
import chalk from "chalk"
import type { AITool } from "./detect-tools.js"
import { claudeSkill } from "../templates/skills/claude.js"
import { cursorSkill } from "../templates/skills/cursor.js"
import { copilotPrompt } from "../templates/skills/copilot.js"

export function writeSkill(projectRoot: string, tool: AITool, overwrite = false): void {
  const skillContent = getSkillContent(tool.id)
  if (!skillContent) return

  if (tool.id === "claude" || tool.id === "cursor" || tool.id === "windsurf" || tool.id === "opencode") {
    const skillDir = path.join(projectRoot, tool.skillPath)
    fs.mkdirSync(skillDir, { recursive: true })
    const filePath = path.join(skillDir, "SKILL.md")
    if (overwrite) {
      fs.writeFileSync(filePath, skillContent, "utf-8")
      console.log(`  ${chalk.green("✓")} Updated ${path.relative(process.cwd(), filePath)}`)
    } else {
      writeIfNew(filePath, skillContent)
    }
  } else if (tool.id === "copilot") {
    const promptDir = path.join(projectRoot, tool.skillPath)
    fs.mkdirSync(promptDir, { recursive: true })
    const filePath = path.join(promptDir, "crev.prompt.md")
    if (overwrite) {
      fs.writeFileSync(filePath, skillContent, "utf-8")
      console.log(`  ${chalk.green("✓")} Updated ${path.relative(process.cwd(), filePath)}`)
    } else {
      writeIfNew(filePath, skillContent)
    }
  }
}

function writeIfNew(filePath: string, content: string): void {
  if (fs.existsSync(filePath) && fs.readFileSync(filePath, "utf-8").trim()) {
    return
  }
  fs.writeFileSync(filePath, content, "utf-8")
  console.log(`${chalk.green("✓")} Created ${path.relative(process.cwd(), filePath)}`)
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
