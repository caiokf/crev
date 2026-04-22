import fs from "node:fs"
import path from "node:path"
import chalk from "chalk"
import type { AITool } from "./detect-tools.js"
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
