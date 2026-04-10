import fs from "node:fs"
import path from "node:path"
import type { Command } from "commander"
import chalk from "chalk"
import { checkbox, confirm } from "@inquirer/prompts"
import { detectAITools, type AITool } from "../util/detect-tools.js"
import { configTemplate } from "../templates/config.js"
import { quickSchema } from "../templates/schemas/quick.js"
import { standardSchema } from "../templates/schemas/standard.js"
import { thoroughSchema } from "../templates/schemas/thorough.js"
import { engineerAgent } from "../templates/agents/engineer.js"
import { securityAgent } from "../templates/agents/security.js"
import { architectAgent } from "../templates/agents/architect.js"
import { performanceAgent } from "../templates/agents/performance.js"
import { testingAgent } from "../templates/agents/testing.js"
import { documentationAgent } from "../templates/agents/documentation.js"
import { claudeSkill } from "../templates/skills/claude.js"
import { cursorSkill } from "../templates/skills/cursor.js"
import { copilotPrompt } from "../templates/skills/copilot.js"

const BANNER = `
  ${chalk.cyan("██████")} ${chalk.cyan("████████")}  ${chalk.cyan("████████")} ${chalk.cyan("██")}     ${chalk.cyan("██")}
 ${chalk.cyan("██")}      ${chalk.cyan("██")}     ${chalk.cyan("██")} ${chalk.cyan("██")}       ${chalk.cyan("██")}     ${chalk.cyan("██")}
 ${chalk.cyan("██")}      ${chalk.cyan("████████")}  ${chalk.cyan("█████")}    ${chalk.cyan("██")}     ${chalk.cyan("██")}
 ${chalk.cyan("██")}      ${chalk.cyan("██")}   ${chalk.cyan("██")}   ${chalk.cyan("██")}        ${chalk.cyan("██")}   ${chalk.cyan("██")}
  ${chalk.cyan("██████")} ${chalk.cyan("██")}     ${chalk.cyan("██")} ${chalk.cyan("████████")}    ${chalk.cyan("███")}

 ${chalk.dim("AI-powered multi-reviewer code review")}
`

const SCHEMAS: Record<string, { label: string; content: string }> = {
  quick: { label: "quick       — Fast review (1 reviewer, sonnet)", content: quickSchema },
  standard: { label: "standard    — Balanced review (3 reviewers)", content: standardSchema },
  thorough: { label: "thorough    — Comprehensive (6 reviewers)", content: thoroughSchema },
}

const AGENTS: Record<string, { label: string; content: string }> = {
  "engineer.md": { label: "engineer.md", content: engineerAgent },
  "security.md": { label: "security.md", content: securityAgent },
  "architect.md": { label: "architect.md", content: architectAgent },
  "performance.md": { label: "performance.md", content: performanceAgent },
  "testing.md": { label: "testing.md", content: testingAgent },
  "documentation.md": { label: "documentation.md", content: documentationAgent },
}

export function registerInitCommand(program: Command): void {
  program
    .command("init [path]")
    .description("Interactive TUI setup")
    .option("--tools <list>", "Comma-separated tool IDs (all/none/claude,cursor,...)")
    .option("--schemas <list>", "Comma-separated schema names (all/quick,standard,...)")
    .option("--agents <list>", "Comma-separated agent names (all/engineer.md,...)")
    .action(async (initPath, opts) => {
      const projectRoot = initPath ? path.resolve(initPath) : process.cwd()
      const crevDir = path.join(projectRoot, ".crev")

      const isInteractive = !opts.tools && !opts.schemas && !opts.agents

      if (isInteractive) {
        await runInteractive(projectRoot, crevDir)
      } else {
        await runNonInteractive(projectRoot, crevDir, opts)
      }
    })
}

async function runInteractive(projectRoot: string, crevDir: string): Promise<void> {
  console.log(BANNER)
  console.log(chalk.dim("─".repeat(40)))
  console.log()

  // Detect AI tools
  const tools = detectAITools(projectRoot)
  const detectedTools = tools.filter((t) => t.detected)

  let selectedTools: AITool[] = []
  if (tools.length > 0) {
    const choices = tools.map((t) => ({
      name: `${t.name}${t.detected ? chalk.dim(` (detected: ${t.detectionPath})`) : ""}`,
      value: t.id,
      checked: t.detected,
    }))

    const selected = await checkbox({
      message: "Select AI tools to configure skills for:",
      choices,
    })

    selectedTools = tools.filter((t) => selected.includes(t.id))
  }

  // Schema selection
  const includeSchemas = await confirm({ message: "Include starter schemas?", default: true })
  let selectedSchemas: string[] = []
  if (includeSchemas) {
    selectedSchemas = await checkbox({
      message: "Select schemas:",
      choices: Object.entries(SCHEMAS).map(([key, val]) => ({
        name: val.label,
        value: key,
        checked: key !== "thorough",
      })),
    })
  }

  // Agent selection
  const includeAgents = await confirm({ message: "Include starter agent personas?", default: true })
  let selectedAgents: string[] = []
  if (includeAgents) {
    selectedAgents = await checkbox({
      message: "Select agents:",
      choices: Object.entries(AGENTS).map(([key, val]) => ({
        name: val.label,
        value: key,
        checked: ["engineer.md", "security.md", "architect.md"].includes(key),
      })),
    })
  }

  // Scaffold
  await scaffold(projectRoot, crevDir, selectedSchemas, selectedAgents, selectedTools)
}

async function runNonInteractive(
  projectRoot: string,
  crevDir: string,
  opts: { tools?: string; schemas?: string; agents?: string },
): Promise<void> {
  const tools = detectAITools(projectRoot)

  const selectedTools =
    opts.tools === "all"
      ? tools
      : opts.tools === "none"
        ? []
        : opts.tools
          ? tools.filter((t) => opts.tools!.split(",").includes(t.id))
          : []

  const selectedSchemas =
    opts.schemas === "all"
      ? Object.keys(SCHEMAS)
      : opts.schemas
        ? opts.schemas.split(",").filter((s) => s in SCHEMAS)
        : ["quick", "standard"]

  const selectedAgents =
    opts.agents === "all"
      ? Object.keys(AGENTS)
      : opts.agents
        ? opts.agents.split(",").filter((a) => a in AGENTS)
        : ["engineer.md", "security.md", "architect.md"]

  await scaffold(projectRoot, crevDir, selectedSchemas, selectedAgents, selectedTools)
}

async function scaffold(
  projectRoot: string,
  crevDir: string,
  schemas: string[],
  agents: string[],
  tools: AITool[],
): Promise<void> {
  // Create directories
  for (const dir of ["schemas", "agents", "diffs", "reviews"]) {
    fs.mkdirSync(path.join(crevDir, dir), { recursive: true })
  }

  // Write config
  writeIfNew(path.join(crevDir, "config.yaml"), configTemplate)

  // Write schemas
  for (const name of schemas) {
    const schema = SCHEMAS[name]
    if (schema) {
      writeIfNew(path.join(crevDir, "schemas", `${name}.yaml`), schema.content)
    }
  }

  // Write agents
  for (const name of agents) {
    const agent = AGENTS[name]
    if (agent) {
      writeIfNew(path.join(crevDir, "agents", name), agent.content)
    }
  }

  // Write .gitkeep files
  writeIfNew(path.join(crevDir, "diffs", ".gitkeep"), "")
  writeIfNew(path.join(crevDir, "reviews", ".gitkeep"), "")

  // Write skills for selected tools
  for (const tool of tools) {
    writeSkill(projectRoot, tool)
  }

  // Run auto-doctor
  console.log()
  console.log(chalk.dim("Running health check..."))
  console.log()

  try {
    const { getAllRuntimes } = await import("@crev/runtimes")
    const { listSchemas, loadSchemaFile } = await import("../core/schema.js")

    const schemasDir = path.join(crevDir, "schemas")
    const schemaNames = listSchemas(schemasDir)

    // Collect referenced runtimes
    const referencedRuntimes = new Set<string>()
    for (const name of schemaNames) {
      try {
        const schema = loadSchemaFile(path.join(schemasDir, `${name}.yaml`))
        for (const r of schema.reviewers) referencedRuntimes.add(r.runtime)
      } catch {}
    }

    // Check each referenced runtime
    for (const name of referencedRuntimes) {
      try {
        const allRuntimes = getAllRuntimes()
        const runtime = allRuntimes.find((r) => r.name === name)
        if (runtime) {
          const health = await runtime.healthCheck()
          const installed = health.installed ? chalk.green("✓ installed") : chalk.red("✗ not found")
          const auth =
            health.authenticated === "yes"
              ? chalk.green("✓ authenticated")
              : health.authenticated === "no"
                ? chalk.red("✗ not authenticated")
                : chalk.yellow("? unknown")
          console.log(`  ${name.padEnd(14)} ${installed}   ${auth}`)
        }
      } catch {}
    }

    // Schema readiness
    console.log()
    for (const name of schemaNames) {
      try {
        const schema = loadSchemaFile(path.join(schemasDir, `${name}.yaml`))
        const issues: string[] = []
        for (const r of schema.reviewers) {
          const allRuntimes = getAllRuntimes()
          const runtime = allRuntimes.find((rt) => rt.name === r.runtime)
          if (runtime) {
            const health = await runtime.healthCheck()
            if (!health.installed || health.authenticated === "no") {
              issues.push(`${r.runtime} not ready`)
            }
          }
        }
        if (issues.length === 0) {
          console.log(`  ${name}.yaml${" ".repeat(16 - name.length)}${chalk.green("✓ ready")}`)
        } else {
          console.log(`  ${name}.yaml${" ".repeat(16 - name.length)}${chalk.red("✗ " + issues.join(", "))}`)
        }
      } catch {}
    }
  } catch {
    // Health check failed, not critical
  }

  console.log()
  console.log(chalk.dim("─".repeat(40)))
  console.log()
  console.log(`  Run ${chalk.cyan("crev run --schema quick")} to start your first review.`)
  console.log()
}

function writeIfNew(filePath: string, content: string): void {
  if (fs.existsSync(filePath) && fs.readFileSync(filePath, "utf-8").trim()) {
    return // Don't overwrite existing non-empty files
  }
  fs.writeFileSync(filePath, content, "utf-8")
  const relative = path.relative(process.cwd(), filePath)
  console.log(`${chalk.green("✓")} Created ${relative}`)
}

function writeSkill(projectRoot: string, tool: AITool): void {
  const skillContent = getSkillContent(tool.id)
  if (!skillContent) return

  if (tool.id === "claude" || tool.id === "cursor" || tool.id === "windsurf" || tool.id === "opencode") {
    const skillDir = path.join(projectRoot, tool.skillPath)
    fs.mkdirSync(skillDir, { recursive: true })
    writeIfNew(path.join(skillDir, "SKILL.md"), skillContent)
  } else if (tool.id === "copilot") {
    const promptDir = path.join(projectRoot, tool.skillPath)
    fs.mkdirSync(promptDir, { recursive: true })
    writeIfNew(path.join(promptDir, "crev.prompt.md"), skillContent)
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
