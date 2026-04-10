import fs from "node:fs"
import path from "node:path"
import type { Command } from "commander"
import chalk from "chalk"
import { findCrevDir } from "../core/config.js"
import { getAgentsDir } from "../util/paths.js"

const TEMPLATE = `You are a code reviewer focused on [AREA].

Focus on:
- [Primary concern]
- [Secondary concern]
- [Additional focus area]

Ignore: style, naming, formatting (unless they affect correctness).
`

export function registerAgentInitCommand(program: Command): void {
  const agent = program.command("agent").description("Agent management")

  agent
    .command("init <name>")
    .description("Scaffold an empty agent persona")
    .action((name) => {
      const crevDir = findCrevDir()
      const agentsDir = getAgentsDir(crevDir)
      fs.mkdirSync(agentsDir, { recursive: true })

      const fileName = name.endsWith(".md") ? name : `${name}.md`
      const filePath = path.join(agentsDir, fileName)
      if (fs.existsSync(filePath)) {
        console.error(`Error: Agent "${name}" already exists at ${filePath}`)
        process.exit(1)
      }

      fs.writeFileSync(filePath, TEMPLATE, "utf-8")
      console.log(`${chalk.green("✓")} Created ${path.relative(process.cwd(), filePath)}`)
    })
}
