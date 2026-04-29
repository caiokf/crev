import path from "node:path"
import type { Command } from "commander"
import chalk from "chalk"
import { Effect } from "effect"
import { detectAITools, type AITool } from "../util/detect-tools.js"
import { separator } from "../util/terminal.js"
import { initAction, SCHEMA_TEMPLATES } from "../actions/init.js"
import { Prompter, PrompterLive } from "../services/Prompter.js"
import { COMMAND_DESCRIPTIONS } from "./metadata.js"

const BANNER = `
  ${chalk.cyan("██████")} ${chalk.cyan("████████")}  ${chalk.cyan("████████")} ${chalk.cyan("██")}     ${chalk.cyan("██")}
 ${chalk.cyan("██")}      ${chalk.cyan("██")}     ${chalk.cyan("██")} ${chalk.cyan("██")}       ${chalk.cyan("██")}     ${chalk.cyan("██")}
 ${chalk.cyan("██")}      ${chalk.cyan("████████")}  ${chalk.cyan("█████")}    ${chalk.cyan("██")}     ${chalk.cyan("██")}
 ${chalk.cyan("██")}      ${chalk.cyan("██")}   ${chalk.cyan("██")}   ${chalk.cyan("██")}        ${chalk.cyan("██")}   ${chalk.cyan("██")}
  ${chalk.cyan("██████")} ${chalk.cyan("██")}     ${chalk.cyan("██")} ${chalk.cyan("████████")}    ${chalk.cyan("███")}

 ${chalk.dim("AI-powered multi-reviewer code review")}
`

type InitOptions = { tools?: string; schemas?: string }

export function registerInitCommand(program: Command): void {
  program
    .command("init [path]")
    .description(COMMAND_DESCRIPTIONS.init)
    .option("--tools <list>", "Comma-separated tool IDs (all/none/claude,cursor,...)")
    .option("--schemas <list>", "Comma-separated schema names (all/quick,standard,...)")
    .action(async (initPath: string | undefined, opts: InitOptions) => {
      const projectRoot = initPath ? path.resolve(initPath) : process.cwd()

      const isInteractive = !opts.tools && !opts.schemas && process.stdin.isTTY

      const selections = isInteractive
        ? await resolveInteractive(projectRoot)
        : resolveNonInteractive(projectRoot, opts)

      const output = await Effect.runPromise(
        initAction({
          projectRoot,
          tools: selections.tools,
          schemaNames: selections.schemaNames,
        }),
      )

      renderPostInit(output)
    })
}

type Selections = { tools: AITool[]; schemaNames: string[] }

async function resolveInteractive(projectRoot: string): Promise<Selections> {
  console.log(BANNER)
  console.log(chalk.dim(separator()))
  console.log()

  const tools = detectAITools(projectRoot)

  const program = Effect.gen(function* () {
    const prompter = yield* Prompter

    let selectedTools: AITool[] = []
    if (tools.length > 0) {
      const selected = yield* prompter.checkbox<string>({
        message: "Select AI tools to configure skills for:",
        choices: tools.map((t) => ({
          name: `${t.name}${t.detected ? chalk.dim(` (detected: ${t.detectionPath})`) : ""}`,
          value: t.id,
          checked: t.detected,
        })),
      })
      selectedTools = tools.filter((t) => selected.includes(t.id))
    }

    const includeSchemas = yield* prompter.confirm({
      message: "Include starter schemas?",
      default: true,
    })

    let schemaNames: string[] = []
    if (includeSchemas) {
      schemaNames = yield* prompter.checkbox<string>({
        message: "Select schemas:",
        choices: Object.entries(SCHEMA_TEMPLATES).map(([key, val]) => ({
          name: val.label,
          value: key,
          checked: key !== "thorough",
        })),
      })
    }

    return { tools: selectedTools, schemaNames }
  })

  return Effect.runPromise(program.pipe(Effect.provide(PrompterLive)))
}

function resolveNonInteractive(projectRoot: string, opts: InitOptions): Selections {
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
      ? Object.keys(SCHEMA_TEMPLATES)
      : opts.schemas
        ? opts.schemas.split(",").filter((s) => s in SCHEMA_TEMPLATES)
        : ["quick", "standard"]

  return { tools: selectedTools, schemaNames: selectedSchemas }
}

function renderPostInit(output: {
  crevDir: string
  runtimeHealth: ReadonlyArray<{
    name: string
    installed: boolean
    authenticated: "yes" | "no" | "unknown"
  }>
  schemaReadiness: ReadonlyArray<{ name: string; ready: boolean; issues: string[] }>
  healthError?: string
}): void {
  console.log()
  console.log(chalk.dim("Running health check..."))
  console.log()

  if (output.healthError) {
    console.error(`  ${chalk.dim("Health check failed:")} ${output.healthError}`)
  } else {
    for (const health of output.runtimeHealth) {
      if (!health.installed) continue
      const installed = chalk.green("✓ installed")
      const auth =
        health.authenticated === "yes"
          ? chalk.green("✓ auth'd")
          : health.authenticated === "no"
            ? chalk.red("✗ no auth")
            : chalk.yellow("? unknown")
      console.log(`  ${health.name.padEnd(16)} ${installed}  ${auth}`)
    }

    if (output.schemaReadiness.length > 0) {
      console.log()
      for (const schema of output.schemaReadiness) {
        const label = `${schema.name}.yaml`.padEnd(20)
        if (schema.ready) {
          console.log(`  ${label}${chalk.green("✓ ready")}`)
        } else {
          console.log(`  ${label}${chalk.red("✗ " + schema.issues.join(", "))}`)
        }
      }
    }
  }

  console.log()
  console.log(chalk.dim(separator()))
  console.log()
  console.log(`  Run ${chalk.cyan("crev run --schema quick")} to start your first review.`)
  console.log()
}

