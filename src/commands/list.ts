import type { Command } from "commander"
import chalk from "chalk"
import { getAllRuntimes } from "@caiokf/valet"
import { findCrevDir } from "../core/config.js"
import { listAllSchemas, resolveSchemaPath, loadSchemaFile } from "../core/schema.js"
import { errorMessage } from "../util/cli-errors.js"
import { COMMAND_DESCRIPTIONS, COMMON_OPTION_DESCRIPTIONS } from "./metadata.js"

export function registerListCommand(program: Command): void {
  program
    .command("list")
    .description(COMMAND_DESCRIPTIONS.list)
    .option("--schemas", "List schemas only")
    .option("--runtimes", "List runtimes only")
    .option("--json", COMMON_OPTION_DESCRIPTIONS.json)
    .action((opts) => {
      const crevDir = findCrevDir()
      const jsonOutput = opts.json ?? false
      const showAll = !opts.schemas && !opts.runtimes

      const data: Record<string, unknown> = {}

      if (showAll || opts.schemas) {
        const schemas = listAllSchemas(crevDir).map((name) => {
          try {
            const schemaPath = resolveSchemaPath(name, crevDir)
            if (!schemaPath) return { name, description: "not found", reviewers: 0 }
            const schema = loadSchemaFile(schemaPath)
            return {
              name,
              description: schema.description ?? "",
              reviewers: schema.reviewers.length,
            }
          } catch (err) {
            console.error(`Warning: Failed to load schema "${name}": ${errorMessage(err)}`)
            return { name, description: "error loading", reviewers: 0 }
          }
        })
        data.schemas = schemas

        if (!jsonOutput) {
          console.log()
          if (schemas.length === 0) {
            console.log("  No schemas found in .crev/schemas/")
          } else {
            console.log(`  ${chalk.bold("Schemas")}`)
            for (const s of schemas) {
              console.log(
                `    ${chalk.cyan(s.name)} - ${s.description || "No description"} (${s.reviewers} reviewer${s.reviewers !== 1 ? "s" : ""})`,
              )
            }
          }
        }
      }

      if (showAll || opts.runtimes) {
        const runtimes = getAllRuntimes().map((rt) => ({
          name: rt.name,
          type: rt.type,
          models: [...rt.models],
          defaultModel: rt.defaultModel,
        }))
        data.runtimes = runtimes

        if (!jsonOutput) {
          console.log()
          console.log(`  ${chalk.bold("Runtimes")}`)
          for (const rt of runtimes) {
            console.log(
              `    ${chalk.cyan(rt.name)} (${rt.type}) - models: ${rt.models.join(", ")} ${chalk.dim(`[default: ${rt.defaultModel}]`)}`,
            )
          }
        }
      }

      if (jsonOutput) {
        console.log(JSON.stringify(data, null, 2))
      } else {
        console.log()
      }
    })
}
