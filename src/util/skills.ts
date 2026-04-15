import fs from "node:fs"
import path from "node:path"
import chalk from "chalk"
import type { AITool } from "./detect-tools.js"
import { writeIfNew } from "./paths.js"
import { skillContent } from "../templates/skills/skill.js"

export function writeSkill(projectRoot: string, tool: AITool, overwrite = false): void {
  const skillDir = path.join(projectRoot, tool.skillPath)
  fs.mkdirSync(skillDir, { recursive: true })
  const filePath = path.join(skillDir, "SKILL.md")
  if (overwrite) {
    fs.writeFileSync(filePath, skillContent, "utf-8")
    console.log(`  ${chalk.green("✓")} Updated ${path.relative(process.cwd(), filePath)}`)
  } else {
    writeIfNew(filePath, skillContent)
  }
}
