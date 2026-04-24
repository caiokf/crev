import fs from "node:fs"
import path from "node:path"
import chalk from "chalk"
import { detectAITools, type AITool } from "./detect-tools.js"
import { writeIfNew } from "./paths.js"
import { skillContent } from "../templates/skills/skill.js"

const CODEX_SECTION_START = "<!-- crev:codex:start -->"
const CODEX_SECTION_END = "<!-- crev:codex:end -->"
const CODEX_SECTION_REGEX = /<!-- crev:codex:start -->[\s\S]*?<!-- crev:codex:end -->/m

export function writeSkill(projectRoot: string, tool: AITool, overwrite = false): void {
  if (tool.id === "codex-cli") {
    writeCodexAgentSection(projectRoot)
    return
  }

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

function writeCodexAgentSection(projectRoot: string): void {
  const agentsPath = path.join(projectRoot, "AGENTS.md")
  const current = fs.existsSync(agentsPath) ? fs.readFileSync(agentsPath, "utf-8") : ""
  const next = upsertManagedSection(current, buildCodexSection())
  fs.writeFileSync(agentsPath, next, "utf-8")
  console.log(`  ${chalk.green("✓")} Updated ${path.relative(process.cwd(), agentsPath)}`)
}

function upsertManagedSection(doc: string, section: string): string {
  const normalized = doc.replace(/\r\n/g, "\n")
  if (CODEX_SECTION_REGEX.test(normalized)) {
    return normalized.replace(CODEX_SECTION_REGEX, section)
  }

  const base = normalized.replace(/\s*$/, "")
  if (!base) return `${section}\n`
  return `${base}\n\n${section}\n`
}

function buildCodexSection(): string {
  return [
    CODEX_SECTION_START,
    "## crev",
    "",
    "- `crev run --schema quick --base main`",
    "- `crev doctor`",
    "- `crev schema validate --all`",
    CODEX_SECTION_END,
  ].join("\n")
}

/**
 * Returns AI tools that have crev skills actually installed (skill file exists),
 * as opposed to tools that are merely detected by marker directory.
 */
export function getInstalledSkills(projectRoot: string): AITool[] {
  const tools = detectAITools(projectRoot)
  return tools.filter((tool) => hasSkillInstalled(projectRoot, tool))
}

function hasSkillInstalled(projectRoot: string, tool: AITool): boolean {
  if (tool.id === "codex-cli") {
    const agentsPath = path.join(projectRoot, "AGENTS.md")
    if (!fs.existsSync(agentsPath)) return false
    const content = fs.readFileSync(agentsPath, "utf-8")
    return CODEX_SECTION_REGEX.test(content)
  }

  const filePath = path.join(projectRoot, tool.skillPath, "SKILL.md")
  return fs.existsSync(filePath)
}

/**
 * Checks whether the installed skill file matches the current template.
 */
export function isSkillUpToDate(projectRoot: string, tool: AITool): boolean {
  if (tool.id === "codex-cli") {
    const agentsPath = path.join(projectRoot, "AGENTS.md")
    if (!fs.existsSync(agentsPath)) return false
    const content = fs.readFileSync(agentsPath, "utf-8")
    const match = content.match(CODEX_SECTION_REGEX)
    if (!match) return false
    return match[0] === buildCodexSection()
  }

  const filePath = path.join(projectRoot, tool.skillPath, "SKILL.md")
  if (!fs.existsSync(filePath)) return false
  const current = fs.readFileSync(filePath, "utf-8")
  return current === skillContent
}
