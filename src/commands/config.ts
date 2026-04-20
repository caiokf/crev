import fs from "node:fs"
import type { Command } from "commander"
import chalk from "chalk"
import YAML from "yaml"
import { findCrevDir, getConfigLayerPaths, loadAnnotatedConfig } from "../core/config.js"

export function registerConfigCommand(program: Command): void {
  program
    .command("config")
    .description("Show resolved configuration with source annotations")
    .option("--json", "Machine-readable JSON output")
    .option("--layers", "Show which config files are active")
    .action((opts) => {
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

  // Build a path tracker to annotate lines
  const annotations = buildLineAnnotations(config, provenance)

  console.log()
  for (const line of lines) {
    if (!line.trim()) {
      console.log()
      continue
    }

    const annotation = annotations.get(line)
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
  config: Record<string, unknown>,
  provenance: Record<string, string>,
): Map<string, string> {
  const annotations = new Map<string, string>()

  // Generate YAML and match paths to lines
  const yamlDoc = new YAML.Document(config)
  const yamlStr = yamlDoc.toString({ indent: 2 })
  const lines = yamlStr.split("\n")

  // Track current path by indent level
  const pathStack: string[] = []
  let prevIndent = -1

  for (const line of lines) {
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
        annotations.set(line, source)
      }
    }

    // Check if this is an array container
    if (!value) {
      const source = provenance[dotpath]
      if (source) {
        annotations.set(line, source)
      }
    }
  }

  return annotations
}
