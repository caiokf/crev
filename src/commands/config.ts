import fs from "node:fs"
import type { Command } from "commander"
import chalk from "chalk"
import YAML from "yaml"
import { findCrevDir, getConfigLayerPaths, loadAnnotatedConfig } from "../core/config.js"
import { exitWithError, errorMessage } from "../util/cli-errors.js"
import { COMMAND_DESCRIPTIONS, COMMON_OPTION_DESCRIPTIONS } from "./metadata.js"

export function registerConfigCommand(program: Command): void {
  program
    .command("config")
    .description(COMMAND_DESCRIPTIONS.config)
    .option("--json", COMMON_OPTION_DESCRIPTIONS.json)
    .option("--layers", "Show which config files are active")
    .action((opts) => {
      try {
        const crevDir = findCrevDir()

        if (opts.layers) {
          printLayers(crevDir, opts.json)
          return
        }

        const { config, provenance } = loadAnnotatedConfig(crevDir)

        if (opts.json) {
          console.log(JSON.stringify({ config, provenance }, null, 2))
          return
        }

        printAnnotatedYaml(config, provenance)
      } catch (err) {
        exitWithError(chalk.red(`Error: ${errorMessage(err)}`))
      }
    })
}

function printLayers(crevDir: string, json: boolean): void {
  const layers = getConfigLayerPaths(crevDir)

  const info = layers.map((l) => ({
    label: l.label,
    path: l.path,
    exists: fs.existsSync(l.path),
  }))

  if (json) {
    console.log(JSON.stringify(info, null, 2))
    return
  }

  console.log()
  console.log(`  ${chalk.bold("Config layers")} (lowest → highest priority)`)
  console.log()
  for (const layer of info) {
    const status = layer.exists ? chalk.green("✓") : chalk.dim("·")
    const label = layer.exists ? layer.label : chalk.dim(layer.label)
    console.log(`    ${status} ${label}`)
    console.log(`      ${chalk.dim(layer.path)}`)
  }
  console.log()
}

function printAnnotatedYaml(config: Record<string, unknown>, provenance: Record<string, string>): void {
  const yamlStr = YAML.stringify(config, { indent: 2 })
  const lines = yamlStr.split("\n")

  // Build a path tracker to annotate lines by index.
  // Using line text as the key is incorrect when repeated lines exist
  // (for example multiple "enabled: true" leaves in different sections).
  const annotations = buildLineAnnotations(lines, provenance)

  console.log()
  for (const [lineNumber, line] of lines.entries()) {
    if (!line.trim()) {
      console.log()
      continue
    }

    const annotation = annotations.get(lineNumber)
    if (annotation) {
      console.log(`${line}  ${chalk.dim(`# ${annotation}`)}`)
    } else {
      console.log(line)
    }
  }
}

/**
 * Map YAML output lines to their provenance annotations.
 * This is a best-effort approach that matches leaf key-value lines.
 */
function buildLineAnnotations(
  lines: string[],
  provenance: Record<string, string>,
): Map<number, string> {
  const annotations = new Map<number, string>()

  // Track current path by indent level
  const pathStack: string[] = []
  let prevIndent = -1

  for (const [lineNumber, line] of lines.entries()) {
    if (!line.trim() || line.trim().startsWith("#")) continue

    const indent = line.length - line.trimStart().length
    const match = line.trimStart().match(/^([^:]+):(.*)$/)
    if (!match) continue

    const key = match[1].trim()
    const value = match[2].trim()

    // Adjust stack based on indent
    if (indent <= prevIndent) {
      // Pop back to the right level
      const level = indent / 2
      pathStack.length = level
    }

    pathStack.push(key)
    prevIndent = indent

    const dotpath = pathStack.join(".")

    // Only annotate leaf values (non-empty value after colon)
    if (value && !value.startsWith("|") && !value.startsWith(">")) {
      const source = provenance[dotpath]
      if (source) {
        annotations.set(lineNumber, source)
      }
    }

    // Check if this is an array container
    if (!value) {
      const source = provenance[dotpath]
      if (source) {
        annotations.set(lineNumber, source)
      }
    }
  }

  return annotations
}
