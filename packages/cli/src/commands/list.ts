import path from "node:path"
import type { Command } from "commander"
import chalk from "chalk"
import { getAllRuntimes } from "@crev/runtimes"
import { findCrevDir } from "../core/config.js"
import { listSchemas, loadSchemaFile } from "../core/schema.js"
import { getSchemasDir } from "../util/paths.js"

export function registerListCommand(program: Command): void {
  program
    .command("list")
    .description("Discover schemas and runtimes")
    .option("--schemas", "List schemas only")
    .option("--runtimes", "List runtimes only")
    .option("--json", "Machine-readable JSON output")
    .action((opts) => {
      const crevDir = findCrevDir()
      const jsonOutput = opts.json ?? false
      const showAll = !opts.schemas && !opts.runtimes

      const data: Record<string, unknown> = {}

      if (showAll || opts.schemas) {
        const schemasDir = getSchemasDir(crevDir)
        const schemas = listSchemas(schemasDir).map((name) => {
          try {
            const schema = loadSchemaFile(path.join(schemasDir, `${name}.yaml`))
            return {
              name,
              description: schema.description ?? "",
              reviewers: schema.reviewers.length,
            }
          } catch {
            return { name, description: "error loading", reviewers: 0 }
          }
        })
        data.schemas = schemas

        if (!jsonOutput) {
          if (schemas.length === 0) {
            console.log("  No schemas found in .crev/schemas/")
          } else {
            console.log(chalk.bold("Schemas"))
            for (const s of schemas) {
              console.log(
                `  ${chalk.cyan(s.name)} - ${s.description || "No description"} (${s.reviewers} reviewer${s.reviewers !== 1 ? "s" : ""})`,
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
          if (!showAll || (data.schemas as unknown[])?.length) console.log()
          console.log(chalk.bold("Runtimes"))
          for (const rt of runtimes) {
            console.log(
              `  ${chalk.cyan(rt.name)} (${rt.type}) - models: ${rt.models.join(", ")} ${chalk.dim(`[default: ${rt.defaultModel}]`)}`,
            )
          }
        }
      }

      if (jsonOutput) {
        console.log(JSON.stringify(data, null, 2))
      }
    })
}
