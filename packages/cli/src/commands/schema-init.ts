import fs from "node:fs"
import path from "node:path"
import type { Command } from "commander"
import chalk from "chalk"
import { findCrevDir } from "../core/config.js"
import { getSchemasDir } from "../util/paths.js"

const TEMPLATE = `description: ""
reviewers:
  - name: Engineer
    runtime: claude
    model: sonnet
    # agent: engineer.md
`

export function registerSchemaInitCommand(program: Command): void {
  const schema = program.command("schema").description("Schema management")

  schema
    .command("init <name>")
    .description("Scaffold an empty schema")
    .action((name) => {
      const crevDir = findCrevDir()
      const schemasDir = getSchemasDir(crevDir)
      fs.mkdirSync(schemasDir, { recursive: true })

      const filePath = path.join(schemasDir, `${name}.yaml`)
      if (fs.existsSync(filePath)) {
        console.error(`Error: Schema "${name}" already exists at ${filePath}`)
        process.exit(1)
      }

      fs.writeFileSync(filePath, TEMPLATE, "utf-8")
      console.log(`${chalk.green("✓")} Created ${path.relative(process.cwd(), filePath)}`)
    })
}
