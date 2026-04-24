import type { Command } from "commander"
import chalk from "chalk"
import { Effect } from "effect"
import { listRuntimesAction, listSchemasAction } from "../actions/list.js"
import type { RuntimeSummary, SchemaSummary } from "../actions/list.js"
import { CliLive } from "../layers.js"
import { COMMAND_DESCRIPTIONS, COMMON_OPTION_DESCRIPTIONS } from "./metadata.js"

type ListOptions = {
  schemas?: boolean
  runtimes?: boolean
  json?: boolean
}

export function registerListCommand(program: Command): void {
  program
    .command("list")
    .description(COMMAND_DESCRIPTIONS.list)
    .option("--schemas", "List schemas only")
    .option("--runtimes", "List runtimes only")
    .option("--json", COMMON_OPTION_DESCRIPTIONS.json)
    .action(async (opts: ListOptions) => {
      const showAll = !opts.schemas && !opts.runtimes
      const wantSchemas = showAll || opts.schemas === true
      const wantRuntimes = showAll || opts.runtimes === true

      const data = await Effect.runPromise(
        Effect.gen(function* () {
          const schemas = wantSchemas ? yield* listSchemasAction : undefined
          const runtimes = wantRuntimes ? yield* listRuntimesAction : undefined
          return { schemas, runtimes }
        }).pipe(Effect.provide(CliLive)),
      )

      if (opts.json) {
        // Preserve the historical JSON shape: only include keys we actually produced.
        const payload: Record<string, unknown> = {}
        if (data.schemas) payload.schemas = data.schemas.map(stripErrorForJson)
        if (data.runtimes) payload.runtimes = data.runtimes
        console.log(JSON.stringify(payload, null, 2))
        return
      }

      if (data.schemas) printSchemas(data.schemas)
      if (data.runtimes) printRuntimes(data.runtimes)
      console.log()
    })
}

function stripErrorForJson(s: SchemaSummary): Omit<SchemaSummary, "error"> {
  // The JSON output historically didn't include the `error` field.
  // We warn to stderr instead so CI consumers see a clean JSON payload.
  if (s.error) {
    console.error(`Warning: Failed to load schema "${s.name}": ${s.error}`)
  }
  const { error: _e, ...rest } = s
  void _e
  return rest
}

function printSchemas(schemas: readonly SchemaSummary[]): void {
  console.log()
  if (schemas.length === 0) {
    console.log("  No schemas found in .crev/schemas/")
    return
  }
  console.log(`  ${chalk.bold("Schemas")}`)
  for (const s of schemas) {
    if (s.error) {
      console.error(`Warning: Failed to load schema "${s.name}": ${s.error}`)
    }
    console.log(
      `    ${chalk.cyan(s.name)} - ${s.description || "No description"} (${s.reviewers} reviewer${s.reviewers !== 1 ? "s" : ""})`,
    )
  }
}

function printRuntimes(runtimes: readonly RuntimeSummary[]): void {
  console.log()
  console.log(`  ${chalk.bold("Runtimes")}`)
  for (const rt of runtimes) {
    console.log(
      `    ${chalk.cyan(rt.name)} (${rt.type}) - models: ${rt.models.join(", ")} ${chalk.dim(`[default: ${rt.defaultModel}]`)}`,
    )
  }
}
