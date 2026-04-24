import fs from "node:fs"
import path from "node:path"
import type { Command } from "commander"
import chalk from "chalk"
import { Effect, Exit } from "effect"
import { findCrevDir } from "../core/config.js"
import { showSchemaAction, validateSchemaAction } from "../actions/schema.js"
import { CliLive } from "../layers.js"
import { getSchemasDir } from "../util/paths.js"
import { exitWithCode, exitWithError } from "../util/cli-errors.js"
import { COMMAND_DESCRIPTIONS, COMMON_OPTION_DESCRIPTIONS } from "./metadata.js"

const TEMPLATE = `description: ""
reviewers:
  - name: Engineer
    runtime: claude
    model: sonnet
    prompt: Review the code changes for correctness and potential bugs.
`

export function registerSchemaCommand(program: Command): void {
  const schema = program.command("schema").description(COMMAND_DESCRIPTIONS.schema)

  // --- schema init ---
  // (Still uses direct fs — to be migrated alongside Prompter/init action.)
  schema
    .command("init <name>")
    .description(COMMAND_DESCRIPTIONS.schemaInit)
    .action((name: string) => {
      if (!/^[a-zA-Z0-9._-]{1,100}$/.test(name)) {
        exitWithError(
          chalk.red("Error: Schema name must be 1-100 alphanumeric, dash, dot, or underscore characters"),
        )
      }

      const crevDir = findCrevDir()
      const schemasDir = getSchemasDir(crevDir)
      fs.mkdirSync(schemasDir, { recursive: true })

      const filePath = path.join(schemasDir, `${name}.yaml`)
      if (fs.existsSync(filePath)) {
        exitWithError(chalk.red(`Error: Schema "${name}" already exists at ${filePath}`))
      }

      fs.writeFileSync(filePath, TEMPLATE, "utf-8")
      console.log(`${chalk.green("✓")} Created ${path.relative(process.cwd(), filePath)}`)
    })

  // --- schema show ---
  schema
    .command("show <name>")
    .description(COMMAND_DESCRIPTIONS.schemaShow)
    .option("--json", COMMON_OPTION_DESCRIPTIONS.json)
    .action(async (schemaName: string, opts: { json?: boolean }) => {
      const exit = await Effect.runPromiseExit(
        showSchemaAction(schemaName).pipe(Effect.provide(CliLive)),
      )

      if (Exit.isFailure(exit)) {
        const err = exit.cause._tag === "Fail" ? exit.cause.error : undefined
        if (err?._tag === "SchemaNotFoundError") {
          exitWithError(chalk.red(`Error: Schema "${schemaName}" not found`))
        }
        if (err?._tag === "SchemaInvalidError") {
          exitWithError(chalk.red(`Error: ${err.reason}`))
        }
        exitWithError(chalk.red(`Error: ${err?._tag ?? "unknown"}`))
      }

      const detail = exit.value

      if (opts.json) {
        // Historical JSON shape: schema fields with `name` prefix, no `path`.
        const { path: _path, name, ...schemaFields } = detail
        void _path
        console.log(JSON.stringify({ name, ...schemaFields }, null, 2))
        return
      }

      console.log(`\n  ${chalk.bold(detail.name)}`)
      if (detail.description) {
        console.log(`  ${chalk.dim(detail.description)}`)
      }
      console.log()
      console.log(`  ${chalk.bold("Reviewers")} (${detail.reviewers.length})`)
      for (const r of detail.reviewers) {
        const source = r.agent
          ? chalk.dim(` → ${r.agent}`)
          : r.prompt
            ? chalk.dim(` (inline prompt)`)
            : ""
        console.log(`    ${chalk.cyan(r.name)} ${chalk.dim(`${r.runtime}/${r.model}`)}${source}`)
      }

      if (detail.triage) {
        console.log()
        console.log(`  ${chalk.bold("Triage")}`)
        console.log(
          `    enabled: ${detail.triage.enabled ? chalk.green("yes") : chalk.dim("no")}`,
        )
        if (detail.triage.enabled) {
          console.log(`    runtime: ${detail.triage.runtime}/${detail.triage.model}`)
        }
      }
      console.log()
    })

  // --- schema validate ---
  schema
    .command("validate [file]")
    .description(COMMAND_DESCRIPTIONS.schemaValidate)
    .option("--all", "Validate all schemas in .crev/schemas/")
    .option("--json", COMMON_OPTION_DESCRIPTIONS.json)
    .action(async (file: string | undefined, opts: { all?: boolean; json?: boolean }) => {
      const jsonOutput = opts.json ?? false

      if (!opts.all && !file) {
        exitWithError(chalk.red("Specify a schema file or use --all"))
      }

      const input = opts.all ? ({ all: true } as const) : ({ file: file as string } as const)

      const results = await Effect.runPromise(
        validateSchemaAction(input).pipe(Effect.provide(CliLive)),
      )

      if (opts.all && results.length === 0) {
        if (jsonOutput) {
          console.log(JSON.stringify({ schemas: [], valid: true }))
        } else {
          console.log("No schemas found")
        }
        return
      }

      if (jsonOutput) {
        const valid = results.every((r) => r.valid)
        console.log(JSON.stringify({ schemas: results, valid }))
        return
      }

      let hasErrors = false
      for (const result of results) {
        const name = path.basename(result.file)
        if (result.valid) {
          console.log(`  ${chalk.green("✓")} ${name}`)
        } else {
          hasErrors = true
          console.log(`  ${chalk.red("✗")} ${name}`)
          for (const err of result.errors) {
            console.log(`    ${chalk.red("→")} ${err}`)
          }
        }
      }

      if (hasErrors) {
        exitWithCode(1)
      }
    })
}
