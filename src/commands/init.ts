import fs from "node:fs"
import path from "node:path"
import type { Command } from "commander"
import chalk from "chalk"
import { checkbox, confirm } from "@inquirer/prompts"
import { detectAITools, type AITool } from "../util/detect-tools.js"
import { writeSkill } from "../util/skills.js"
import { writeIfNew } from "../util/paths.js"
import { configTemplate } from "../templates/config.js"
import { quickSchema } from "../templates/schemas/quick.js"
import { standardSchema } from "../templates/schemas/standard.js"
import { thoroughSchema } from "../templates/schemas/thorough.js"

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

export function registerInitCommand(program: Command): void {
  program
    .command("init [path]")
    .description("Interactive TUI setup")
    .option("--tools <list>", "Comma-separated tool IDs (all/none/claude,cursor,...)")
    .option("--schemas <list>", "Comma-separated schema names (all/quick,standard,...)")
    .action(async (initPath, opts) => {
      const projectRoot = initPath ? path.resolve(initPath) : process.cwd()
      const crevDir = path.join(projectRoot, ".crev")

      const isInteractive = !opts.tools && !opts.schemas && process.stdin.isTTY

      if (isInteractive) {
        await runInteractive(projectRoot, crevDir)
      } else {
        await runNonInteractive(projectRoot, crevDir, opts)
      }
    })
}

async function runInteractive(projectRoot: string, crevDir: string): Promise<void> {
  console.log(BANNER)
  console.log(chalk.dim("─".repeat(Math.max(0, Math.min(60, (process.stdout.columns || 80) - 4)))))
  console.log()

  // Detect AI tools
  const tools = detectAITools(projectRoot)

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

  // Scaffold
  await scaffold(projectRoot, crevDir, selectedSchemas, selectedTools)
}

async function runNonInteractive(
  projectRoot: string,
  crevDir: string,
  opts: { tools?: string; schemas?: string },
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

  await scaffold(projectRoot, crevDir, selectedSchemas, selectedTools)
}

async function scaffold(
  projectRoot: string,
  crevDir: string,
  schemas: string[],
  tools: AITool[],
): Promise<void> {
  // Create directories
  for (const dir of ["schemas", "diffs", "reviews"]) {
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
    const { getAllRuntimes } = await import("valet")
    const { listSchemas, loadSchemaFile } = await import("../core/schema.js")

    const schemasDir = path.join(crevDir, "schemas")
    const schemaNames = listSchemas(schemasDir)

    // Collect referenced runtimes
    const referencedRuntimes = new Set<string>()
    for (const name of schemaNames) {
      try {
        const schema = loadSchemaFile(path.join(schemasDir, `${name}.yaml`))
        for (const r of schema.reviewers) referencedRuntimes.add(r.runtime)
      } catch (err) {
        console.log(`  ${chalk.red("✗")} ${name}.yaml: ${err instanceof Error ? err.message : String(err)}`)
      }
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
              ? chalk.green("✓ auth'd")
              : health.authenticated === "no"
                ? chalk.red("✗ no auth")
                : chalk.yellow("? unknown")
          console.log(`  ${name.padEnd(16)} ${installed}  ${auth}`)
        }
      } catch (err) {
        console.log(`  ${name.padEnd(16)} ${chalk.red("✗ error:")} ${err instanceof Error ? err.message : String(err)}`)
      }
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
          console.log(`  ${`${name}.yaml`.padEnd(20)}${chalk.green("✓ ready")}`)
        } else {
          console.log(`  ${`${name}.yaml`.padEnd(20)}${chalk.red("✗ " + issues.join(", "))}`)
        }
      } catch (err) {
        console.log(`  ${`${name}.yaml`.padEnd(20)}${chalk.red("✗ load failed:")} ${err instanceof Error ? err.message : String(err)}`)
      }
    }
  } catch (err) {
    console.log(`  ${chalk.dim("Health check failed:")} ${err instanceof Error ? err.message : String(err)}`)
  }

  console.log()
  console.log(chalk.dim("─".repeat(Math.max(0, Math.min(60, (process.stdout.columns || 80) - 4)))))
  console.log()
  console.log(`  Run ${chalk.cyan("crev run --schema quick")} to start your first review.`)
  console.log()
}

