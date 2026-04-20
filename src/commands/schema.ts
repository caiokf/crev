import fs from "node:fs"
import path from "node:path"
import type { Command } from "commander"
import chalk from "chalk"
import { findCrevDir } from "../core/config.js"
import { listAllSchemas, resolveSchemaPath, parseSchemaFile, validateAgentRefs, loadSchemaFile } from "../core/schema.js"
import { getSchemasDir } from "../util/paths.js"
import { exitWithCode, exitWithError } from "../util/cli-errors.js"

const TEMPLATE = `description: ""
reviewers:
  - name: Engineer
    runtime: claude
    model: sonnet
    prompt: Review the code changes for correctness and potential bugs.
`

export function registerSchemaCommand(program: Command): void {
  const schema = program.command("schema").description("Schema management")

  // --- schema init ---
  schema
    .command("init <name>")
    .description("Scaffold an empty schema")
    .action((name) => {
      if (!/^[a-zA-Z0-9._-]{1,100}$/.test(name)) {
        exitWithError(chalk.red("Error: Schema name must be 1-100 alphanumeric, dash, dot, or underscore characters"))
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
    .description("Display schema details")
    .option("--json", "Machine-readable JSON output")
    .action((schemaName, opts) => {
      const crevDir = findCrevDir()
      const schemaPath = resolveSchemaPath(schemaName, crevDir)

      if (!schemaPath) {
        exitWithError(chalk.red(`Error: Schema "${schemaName}" not found`))
      }

      try {
        const s = loadSchemaFile(schemaPath)

        if (opts.json) {
          console.log(JSON.stringify({ name: schemaName, ...s }, null, 2))
          return
        }

        console.log(`\n  ${chalk.bold(schemaName)}`)
        if (s.description) {
          console.log(`  ${chalk.dim(s.description)}`)
        }
        console.log()
        console.log(`  ${chalk.bold("Reviewers")} (${s.reviewers.length})`)
        for (const r of s.reviewers) {
          const source = r.agent ? chalk.dim(` → ${r.agent}`) : r.prompt ? chalk.dim(` (inline prompt)`) : ""
          console.log(`    ${chalk.cyan(r.name)} ${chalk.dim(`${r.runtime}/${r.model}`)}${source}`)
        }

        if (s.triage) {
          console.log()
          console.log(`  ${chalk.bold("Triage")}`)
          console.log(`    enabled: ${s.triage.enabled ? chalk.green("yes") : chalk.dim("no")}`)
          if (s.triage.enabled) {
            console.log(`    runtime: ${s.triage.runtime}/${s.triage.model}`)
          }
        }
        console.log()
      } catch (e) {
        exitWithError(chalk.red(`Error: ${e instanceof Error ? e.message : String(e)}`))
      }
    })

  // --- schema validate ---
  schema
    .command("validate [file]")
    .description("Validate schemas")
    .option("--all", "Validate all schemas in .crev/schemas/")
    .option("--json", "Machine-readable JSON output")
    .action(async (file, opts) => {
      const crevDir = findCrevDir()
      const jsonOutput = opts.json ?? false

      const results: Array<{ file: string; valid: boolean; errors: string[] }> = []

      if (opts.all) {
        const schemas = listAllSchemas(crevDir)
        if (schemas.length === 0) {
          if (jsonOutput) {
            console.log(JSON.stringify({ schemas: [], valid: true }))
          } else {
            console.log("No schemas found")
          }
          return
        }

        for (const name of schemas) {
          const resolved = resolveSchemaPath(name, crevDir)
          if (resolved) results.push(await validateSingleSchema(resolved, crevDir))
        }
      } else if (file) {
        const schemaPath = path.resolve(file)
        results.push(await validateSingleSchema(schemaPath, crevDir))
      } else {
        exitWithError(chalk.red("Specify a schema file or use --all"))
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

async function validateSingleSchema(
  schemaPath: string,
  crevDir?: string,
): Promise<{ file: string; valid: boolean; errors: string[] }> {
  const errors: string[] = []

  if (!fs.existsSync(schemaPath)) {
    return { file: schemaPath, valid: false, errors: [`File not found: ${schemaPath}`] }
  }

  const content = fs.readFileSync(schemaPath, "utf-8")
  const parseResult = parseSchemaFile(content)

  if (!parseResult.success) {
    for (const issue of parseResult.error.issues) {
      errors.push(`${issue.path.join(".")}: ${issue.message}`)
    }
    return { file: schemaPath, valid: false, errors }
  }

  // Validate agent refs
  const schema = loadSchemaFile(schemaPath)
  const agentIssues = await validateAgentRefs(schema, { schemaPath, crevDir })
  for (const issue of agentIssues) {
    errors.push(issue.message)
  }

  return { file: schemaPath, valid: errors.length === 0, errors }
}
