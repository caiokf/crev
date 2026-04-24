import type { Command } from "commander"
import chalk from "chalk"
import YAML from "yaml"
import { Effect, Exit } from "effect"
import { listConfigLayersAction, showConfigAction } from "../actions/config.js"
import type { ConfigLayerInfo } from "../actions/config.js"
import { CliLive } from "../layers.js"
import { errorMessage, exitWithError } from "../util/cli-errors.js"
import { COMMAND_DESCRIPTIONS, COMMON_OPTION_DESCRIPTIONS } from "./metadata.js"

type ConfigOptions = {
  json?: boolean
  layers?: boolean
}

export function registerConfigCommand(program: Command): void {
  program
    .command("config")
    .description(COMMAND_DESCRIPTIONS.config)
    .option("--json", COMMON_OPTION_DESCRIPTIONS.json)
    .option("--layers", "Show which config files are active")
    .action(async (opts: ConfigOptions) => {
      if (opts.layers) {
        const layers = await Effect.runPromise(
          listConfigLayersAction.pipe(Effect.provide(CliLive)),
        )
        printLayers(layers, opts.json ?? false)
        return
      }

      const exit = await Effect.runPromiseExit(
        showConfigAction.pipe(Effect.provide(CliLive)),
      )

      if (Exit.isFailure(exit)) {
        const err = exit.cause._tag === "Fail" ? exit.cause.error : undefined
        const reason =
          err?._tag === "ConfigParseError"
            ? errorMessage(err.cause)
            : (err?._tag ?? "unknown")
        exitWithError(chalk.red(`Error: ${reason}`))
      }

      const { config, provenance } = exit.value

      if (opts.json) {
        console.log(JSON.stringify({ config, provenance }, null, 2))
        return
      }

      printAnnotatedYaml(config, provenance)
    })
}

function printLayers(layers: ConfigLayerInfo[], json: boolean): void {
  if (json) {
    console.log(JSON.stringify(layers, null, 2))
    return
  }

  console.log()
  console.log(`  ${chalk.bold("Config layers")} (lowest → highest priority)`)
  console.log()
  for (const layer of layers) {
    const status = layer.exists ? chalk.green("✓") : chalk.dim("·")
    const label = layer.exists ? layer.label : chalk.dim(layer.label)
    console.log(`    ${status} ${label}`)
    console.log(`      ${chalk.dim(layer.path)}`)
  }
  console.log()
}

function printAnnotatedYaml(
  config: Record<string, unknown>,
  provenance: Record<string, string>,
): void {
  const yamlStr = YAML.stringify(config, { indent: 2 })
  const lines = yamlStr.split("\n")

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

function buildLineAnnotations(
  lines: string[],
  provenance: Record<string, string>,
): Map<number, string> {
  const annotations = new Map<number, string>()

  const pathStack: string[] = []
  let prevIndent = -1

  for (const [lineNumber, line] of lines.entries()) {
    if (!line.trim() || line.trim().startsWith("#")) continue

    const indent = line.length - line.trimStart().length
    const match = line.trimStart().match(/^([^:]+):(.*)$/)
    if (!match) continue

    const key = match[1].trim()
    const value = match[2].trim()

    if (indent <= prevIndent) {
      const level = indent / 2
      pathStack.length = level
    }

    pathStack.push(key)
    prevIndent = indent

    const dotpath = pathStack.join(".")

    if (value && !value.startsWith("|") && !value.startsWith(">")) {
      const source = provenance[dotpath]
      if (source) {
        annotations.set(lineNumber, source)
      }
    }

    if (!value) {
      const source = provenance[dotpath]
      if (source) {
        annotations.set(lineNumber, source)
      }
    }
  }

  return annotations
}
