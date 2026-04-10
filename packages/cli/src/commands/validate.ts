import fs from "node:fs"
import path from "node:path"
import type { Command } from "commander"
import chalk from "chalk"
import { findCrevDir } from "../core/config.js"
import { listSchemas, parseSchemaFile, validateAgentRefs, loadSchemaFile } from "../core/schema.js"
import { getSchemasDir } from "../util/paths.js"

export function registerValidateCommand(program: Command): void {
  program
    .command("validate [file]")
    .description("Validate schemas and agent references")
    .option("--all", "Validate all schemas in .crev/schemas/")
    .option("--json", "Machine-readable JSON output")
    .action(async (file, opts) => {
      const crevDir = findCrevDir()
      const schemasDir = getSchemasDir(crevDir)
      const jsonOutput = opts.json ?? false

      const results: Array<{ file: string; valid: boolean; errors: string[] }> = []

      if (opts.all) {
        const schemas = listSchemas(schemasDir)
        if (schemas.length === 0) {
          if (jsonOutput) {
            console.log(JSON.stringify({ schemas: [], valid: true }))
          } else {
            console.log("No schemas found in .crev/schemas/")
          }
          return
        }

        for (const name of schemas) {
          const schemaPath = path.join(schemasDir, `${name}.yaml`)
          results.push(await validateSingleSchema(schemaPath, crevDir))
        }
      } else if (file) {
        const schemaPath = path.resolve(file)
        results.push(await validateSingleSchema(schemaPath, crevDir))
      } else {
        console.error("Specify a schema file or use --all")
        process.exit(1)
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
        process.exit(1)
      }
    })
}

async function validateSingleSchema(
  schemaPath: string,
  crevDir: string,
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
  const agentIssues = await validateAgentRefs(schema, crevDir)
  for (const issue of agentIssues) {
    errors.push(issue.message)
  }

  return { file: schemaPath, valid: errors.length === 0, errors }
}
