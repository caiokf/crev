import path from "node:path"
import type { Command } from "commander"
import chalk from "chalk"
import { findCrevDir } from "../core/config.js"
import { loadSchemaFile } from "../core/schema.js"
import { getSchemasDir } from "../util/paths.js"

export function registerShowCommand(program: Command): void {
  program
    .command("show <schema>")
    .description("Display schema details")
    .option("--json", "Machine-readable JSON output")
    .action((schemaName, opts) => {
      const crevDir = findCrevDir()
      const schemaPath = path.join(getSchemasDir(crevDir), `${schemaName}.yaml`)

      try {
        const schema = loadSchemaFile(schemaPath)

        if (opts.json) {
          console.log(JSON.stringify({ name: schemaName, ...schema }, null, 2))
          return
        }

        console.log(`\n  ${chalk.bold(schemaName)}`)
        if (schema.description) {
          console.log(`  ${chalk.dim(schema.description)}`)
        }
        console.log()
        console.log(`  ${chalk.bold("Reviewers")} (${schema.reviewers.length})`)
        for (const r of schema.reviewers) {
          const agent = r.agent ? chalk.dim(` → ${r.agent}`) : ""
          console.log(`    ${chalk.cyan(r.name)} ${chalk.dim(`${r.runtime}/${r.model}`)}${agent}`)
        }

        if (schema.triage) {
          console.log()
          console.log(`  ${chalk.bold("Triage")}`)
          console.log(`    enabled: ${schema.triage.enabled ? chalk.green("yes") : chalk.dim("no")}`)
          if (schema.triage.enabled) {
            console.log(`    runtime: ${schema.triage.runtime}/${schema.triage.model}`)
            if (schema.triage.context && schema.triage.context.length > 0) {
              console.log(`    context: ${schema.triage.context.join(", ")}`)
            }
          }
        }
        console.log()
      } catch (e) {
        console.error(`Error: ${e instanceof Error ? e.message : String(e)}`)
        process.exit(1)
      }
    })
}
