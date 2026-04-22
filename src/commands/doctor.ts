import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import type { Command } from "commander"
import chalk from "chalk"
import { getAllRuntimes, type RuntimeHealth, type RuntimeAdapter } from "@caiokf/valet"
import { findCrevDir, loadLayeredConfig, getRuntimeConfig, resolveModelAlias } from "../core/config.js"
import type { Config } from "../core/config.js"
import { checkSchemaReadiness, checkProjectSetup } from "../core/health.js"
import type { SchemaReadiness, ProjectCheck } from "../core/health.js"
import { listAllSchemas, resolveSchemaPath, loadSchemaFile } from "../core/schema.js"
import { visibleLength, padVisible, truncateVisible } from "../tui/ansi.js"

const ANSI_ESCAPE_REGEX = /\u001b\[[0-?]*[ -/]*[@-~]/g
const ANSI_OSC_REGEX = /\u001b\][^\u0007]*(?:\u0007|\u001b\\)/g

export function registerDoctorCommand(program: Command): void {
  program
    .command("doctor")
    .description("Health check for runtimes and schemas")
    .option("--all", "Check all known runtimes, not just those in schemas")
    .option("--ping", "Send a test prompt through each runtime to verify end-to-end")
    .option("--json", "Machine-readable JSON output")
    .action(async (opts) => {
      const crevDir = findCrevDir()
      const jsonOutput = opts.json ?? false
      const cols = process.stdout.columns ?? 80

      const schemas = listAllSchemas(crevDir)
      const runtimeUsage = new Map<string, string[]>()
      const referencedRuntimes = new Set<string>()
      for (const name of schemas) {
        try {
          const schemaPath = resolveSchemaPath(name, crevDir)
          if (!schemaPath) continue
          const schema = loadSchemaFile(schemaPath)
          for (const reviewer of schema.reviewers) {
            referencedRuntimes.add(reviewer.runtime)
            addRuntimeUsage(runtimeUsage, reviewer.runtime, name)
          }
          if (schema.triage?.enabled && schema.triage.runtime) {
            referencedRuntimes.add(schema.triage.runtime)
            addRuntimeUsage(runtimeUsage, schema.triage.runtime, name)
          }
        } catch {
          // Skip schemas that cannot be loaded
        }
      }

      const config = loadLayeredConfig(crevDir)

      // By default, check only runtimes referenced by schemas. --all checks every runtime.
      const allRuntimes = getAllRuntimes()
      const runtimesToCheck = selectRuntimesToCheck(allRuntimes, referencedRuntimes, opts.all ?? false)
      const allHealthResults: RuntimeHealth[] = new Array(runtimesToCheck.length)

      const isTTY = process.stdout.isTTY && !jsonOutput
      let checked = 0

      if (isTTY) {
        process.stdout.write(`  ${chalk.dim(`Checking runtimes... 0/${runtimesToCheck.length}`)}`)
      }

      await Promise.all(
        runtimesToCheck.map(async (runtime, i) => {
          try {
            allHealthResults[i] = sanitizeRuntimeHealth(await runtime.healthCheck())
          } catch (e) {
            allHealthResults[i] = sanitizeRuntimeHealth({
              name: runtime.name,
              command: runtime.name,
              installed: false,
              version: null,
              authenticated: "unknown",
              authDetail: String(e),
              error: String(e),
            })
          }
          checked++
          if (isTTY) {
            process.stdout.write(`\r\x1B[2K  ${chalk.dim(`Checking runtimes... ${checked}/${runtimesToCheck.length}`)}`)
          }
        }),
      )

      if (isTTY) {
        process.stdout.write("\r\x1B[2K")
      }

      const healthResults = allHealthResults
      const healthByRuntime = new Map(allHealthResults.map((h) => [h.name, h] as const))

      const projectChecks = checkProjectSetup(crevDir)
      const schemaReadiness = checkSchemaReadiness(crevDir, healthResults)

      let pingResults: PingResult[] | undefined
      if (opts.ping) {
        const readyRuntimes = runtimesToCheck.filter((rt) => {
          const health = healthByRuntime.get(rt.name)
          return health?.installed && health?.authenticated !== "no"
        })

        if (readyRuntimes.length > 0) {
          pingResults = await runPingTests(readyRuntimes, config, jsonOutput)
        } else {
          pingResults = []
        }
      }

      if (jsonOutput) {
        const payload = buildDoctorJsonPayload({
          healthResults,
          runtimeUsage,
          schemaReadiness,
          projectChecks,
          includePing: opts.ping ?? false,
          pingResults,
        })
        console.log(JSON.stringify(payload, null, 2))
        return
      }

      // --- Unified pretty print ---

      // Pre-compute name column width for alignment
      const nameColWidth = Math.max(
        14,
        ...healthResults.map((h) => {
          const rtConfig = getRuntimeConfig(config, h.name)
          const cmd = rtConfig.command ?? h.command ?? h.name
          return cmd !== h.name && cmd !== h.command
            ? h.name.length + cmd.length + 3 // "name (cmd)"
            : h.name.length
        }),
      ) + 2 // padding

      // Runtimes
      console.log(`\n  ${chalk.bold("Runtimes")}`)
      console.log(`  ${"─".repeat(Math.max(0, Math.min(60, cols - 4)))}`)

      for (const health of healthResults) {
        console.log(formatRuntimeLine(health, config, cols, nameColWidth))
      }

      if (healthResults.length === 0) {
        console.log(`  ${chalk.dim("No runtimes to check (no schemas found)")}`)
      }

      // Schema readiness
      if (schemas.length > 0) {
        const schemaColWidth = Math.max(...schemaReadiness.map((s) => s.name.length)) + 2
        console.log(`\n  ${chalk.bold("Schemas")}`)
        console.log(`  ${"─".repeat(Math.max(0, Math.min(60, cols - 4)))}`)

        for (const schema of schemaReadiness) {
          if (schema.ready) {
            console.log(`  ${schema.name.padEnd(schemaColWidth)} ${chalk.green("✓ ready")}`)
          } else {
            console.log(`  ${schema.name.padEnd(schemaColWidth)} ${chalk.red("✗ not ready")}`)
            for (const issue of schema.issues) {
              console.log(`    ${chalk.dim(issue)}`)
            }
          }
        }
      }

      // Project setup
      const checkColWidth = Math.max(...projectChecks.map((c) => c.name.length)) + 2
      console.log(`\n  ${chalk.bold("Project Setup")}`)
      console.log(`  ${"─".repeat(Math.max(0, Math.min(60, cols - 4)))}`)
      for (const check of projectChecks) {
        const icon = check.ok ? chalk.green("✓") : chalk.red("✗")
        console.log(`  ${check.name.padEnd(checkColWidth)} ${icon} ${check.detail}`)
      }

      // Fix suggestions
      const brokenRuntimes = healthResults.filter((h) => h.authenticated === "no")
      if (brokenRuntimes.length > 0) {
        console.log()
        for (const rt of brokenRuntimes) {
          console.log(`  ${chalk.yellow("⚠")} Fix: ${rt.authDetail}`)
        }
      }

      // Ping test
      if (opts.ping) {
        if (!pingResults || pingResults.length === 0) {
          console.log(`\n  ${chalk.dim("No runtimes available for ping test")}`)
        } else {
          console.log(`\n  ${chalk.bold("Ping")}`)
          console.log(`  ${"─".repeat(Math.max(0, Math.min(60, cols - 4)))}`)
          for (const r of pingResults) {
            const icon = r.pass ? chalk.green("✓") : chalk.red("✗")
            const time = chalk.dim(`${(r.durationMs / 1000).toFixed(1)}s`)
            const detail = r.pass ? time : `${time} ${chalk.dim(r.error ?? "")}`
            console.log(`  ${r.runtime.padEnd(14)} ${r.model.padEnd(22)} ${icon} ${detail}`)
          }
        }
      }

      console.log()
    })
}

type DoctorJsonPayload = {
  runtimes: Array<RuntimeHealth & { usedIn: string[] }>
  schemas: SchemaReadiness[]
  project: ProjectCheck[]
  ping?: PingResult[]
}

export function buildDoctorJsonPayload(input: {
  healthResults: RuntimeHealth[]
  runtimeUsage: Map<string, string[]>
  schemaReadiness: SchemaReadiness[]
  projectChecks: ProjectCheck[]
  includePing: boolean
  pingResults?: PingResult[]
}): DoctorJsonPayload {
  const payload: DoctorJsonPayload = {
    runtimes: input.healthResults.map((h) => ({
      ...h,
      usedIn: [...new Set(input.runtimeUsage.get(h.name) ?? [])],
    })),
    schemas: input.schemaReadiness,
    project: input.projectChecks,
  }

  if (input.includePing) payload.ping = input.pingResults ?? []

  return payload
}

function addRuntimeUsage(runtimeUsage: Map<string, string[]>, runtime: string, schemaName: string): void {
  const list = runtimeUsage.get(runtime) ?? []
  if (!list.includes(schemaName)) list.push(schemaName)
  runtimeUsage.set(runtime, list)
}

export function selectRuntimesToCheck<T extends { name: string }>(
  allRuntimes: ReadonlyArray<T>,
  referencedRuntimes: ReadonlySet<string>,
  includeAll: boolean,
): T[] {
  if (includeAll) return [...allRuntimes]
  if (referencedRuntimes.size === 0) return []
  return allRuntimes.filter((runtime) => referencedRuntimes.has(runtime.name))
}

function sanitizeRuntimeText(value: string | null | undefined): string | null {
  if (!value) return null
  const stripped = value
    .replace(ANSI_OSC_REGEX, "")
    .replace(ANSI_ESCAPE_REGEX, "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()

  if (!stripped) return null
  return stripped.slice(0, 240)
}

export function sanitizeRuntimeHealth(health: RuntimeHealth): RuntimeHealth {
  return {
    ...health,
    version: sanitizeRuntimeText(health.version),
    authDetail: sanitizeRuntimeText(health.authDetail),
    error: sanitizeRuntimeText(health.error),
  }
}

/**
 * Responsive runtime line — progressively adds detail based on terminal width.
 *
 * Narrow (< 60):  claude          ✓ installed  ✓ auth'd
 * Medium (60-90): claude          ✓ installed  2.1.81   ✓ auth'd
 * Wide   (> 90):  claude          ✓ installed  2.1.81   ✓ auth'd  env: ANTHROPIC_API_KEY
 */
function formatRuntimeLine(health: RuntimeHealth, config: Config, cols: number, nameColWidth: number): string {
  const rtConfig = getRuntimeConfig(config, health.name)
  const commandName = rtConfig.command ?? health.command ?? health.name

  // Name — show command override if different from runtime name
  const hasOverride = commandName !== health.name && commandName !== health.command
  const nameLabel = hasOverride
    ? `${chalk.cyan(health.name)} ${chalk.dim(`(${commandName})`)}`
    : chalk.cyan(health.name)

  const installed = health.installed
    ? chalk.green("✓ installed")
    : chalk.red("✗ not found")

  const auth =
    health.authenticated === "yes"
      ? chalk.green("✓ auth'd")
      : health.authenticated === "no"
        ? chalk.red("✗ no auth")
        : chalk.yellow("? unknown")

  // Build progressively based on width
  const parts: string[] = []
  parts.push(`  ${padVisible(nameLabel, nameColWidth)}`)
  parts.push(installed)

  // Version — add if medium width or wider
  if (cols >= 60 && health.installed) {
    const version = health.version ?? "–"
    parts.push(version.padEnd(10))
  }

  parts.push(auth)

  const line = parts.join("  ")

  // Auth detail — add if wide and there's room
  if (cols >= 90 && health.authDetail) {
    const used = visibleLength(line) + 2
    const remaining = cols - used
    if (remaining > 10) {
      const detail = chalk.dim(health.authDetail)
      return `${line}  ${truncateVisible(detail, remaining)}`
    }
  }

  return line
}

type PingResult = {
  runtime: string
  model: string
  pass: boolean
  durationMs: number
  error?: string
}

async function runPingTests(
  runtimes: RuntimeAdapter[],
  config: Config,
  jsonOutput: boolean,
): Promise<PingResult[]> {
  const PING_PROMPT = 'Respond with exactly this text and nothing else: hello ping-test'
  const results: PingResult[] = []

  const isTTY = process.stdout.isTTY && !jsonOutput

  // Run one model per runtime (the default model)
  const tasks = runtimes
    .filter((rt) => rt.supportsCustomPrompt)
    .map((rt) => ({
      runtime: rt,
      model: resolveModelAlias(config, rt.defaultModel),
    }))

  if (isTTY) {
    process.stdout.write(`\n  ${chalk.dim(`Running ping tests... 0/${tasks.length}`)}`)
  }

  let done = 0
  await Promise.all(
    tasks.map(async ({ runtime, model }) => {
      const promptFile = path.join(os.tmpdir(), `crev-ping-${runtime.name}-${process.pid}.txt`)
      fs.writeFileSync(promptFile, PING_PROMPT, "utf-8")

      const start = performance.now()
      try {
        const rtConfig = getRuntimeConfig(config, runtime.name)
        const result = await runtime.execute({
          taskName: "ping-test",
          model,
          prompt: PING_PROMPT,
          promptFile,
          diff: { diffContent: "", diffFile: "", type: "all" },
          outputFormat: "",
          overrides: {
            command: rtConfig.command,
            env: rtConfig.env,
            extraArgs: rtConfig.args,
          },
        })

        const durationMs = performance.now() - start
        const pass = result.exitCode === 0 && result.raw.toLowerCase().includes("hello ping-test")
        results.push({
          runtime: runtime.name,
          model,
          pass,
          durationMs,
          error: pass ? undefined : (result.exitCode !== 0 ? `exit code ${result.exitCode}` : "unexpected output"),
        })
      } catch (err) {
        results.push({
          runtime: runtime.name,
          model,
          pass: false,
          durationMs: performance.now() - start,
          error: err instanceof Error ? err.message : String(err),
        })
      } finally {
        try { fs.unlinkSync(promptFile) } catch {}
        done++
        if (isTTY) {
          process.stdout.write(`\r\x1B[2K  ${chalk.dim(`Running ping tests... ${done}/${tasks.length}`)}`)
        }
      }
    }),
  )

  if (isTTY) {
    process.stdout.write("\r\x1B[2K")
  }

  return results.sort((a, b) => a.runtime.localeCompare(b.runtime))
}
