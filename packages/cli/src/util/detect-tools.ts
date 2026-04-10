import fs from "node:fs"
import path from "node:path"

export type AITool = {
  name: string
  id: string
  detected: boolean
  detectionPath: string
  skillPath: string
  commandPath?: string
}

const TOOL_DEFINITIONS: Array<{
  name: string
  id: string
  detectDir: string
  skillDir: string
  commandDir?: string
}> = [
  {
    name: "Claude Code",
    id: "claude",
    detectDir: ".claude",
    skillDir: ".claude/skills/crev",
    commandDir: ".claude/commands",
  },
  {
    name: "Cursor",
    id: "cursor",
    detectDir: ".cursor",
    skillDir: ".cursor/skills/crev",
    commandDir: ".cursor/commands",
  },
  {
    name: "Windsurf",
    id: "windsurf",
    detectDir: ".windsurf",
    skillDir: ".windsurf/skills/crev",
    commandDir: ".windsurf/workflows",
  },
  {
    name: "OpenCode",
    id: "opencode",
    detectDir: ".opencode",
    skillDir: ".opencode/skills/crev",
    commandDir: ".opencode/commands",
  },
  {
    name: "GitHub Copilot",
    id: "copilot",
    detectDir: ".github",
    skillDir: ".github/prompts",
  },
  {
    name: "Codex CLI",
    id: "codex-cli",
    detectDir: "AGENTS.md",
    skillDir: ".",
  },
  {
    name: "Gemini CLI",
    id: "gemini-cli",
    detectDir: ".gemini",
    skillDir: ".gemini/commands",
  },
]

export function detectAITools(projectRoot: string): AITool[] {
  return TOOL_DEFINITIONS.map((def) => {
    const detectPath = path.join(projectRoot, def.detectDir)
    const detected = fs.existsSync(detectPath)
    return {
      name: def.name,
      id: def.id,
      detected,
      detectionPath: def.detectDir,
      skillPath: def.skillDir,
      commandPath: def.commandDir,
    }
  })
}
