import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import type { Command } from "commander"
import chalk from "chalk"
import { Effect } from "effect"
import type { RuntimeAdapter, RuntimeHealth } from "@caiokf/valet"
import { getRuntimeConfig, loadLayeredConfig, resolveModelAlias } from "../core/config.js"
import type { Config } from "../core/config.js"
import type { ProjectCheck, SchemaReadiness } from "../core/health.js"
import { doctorAction } from "../actions/doctor.js"
import type { SkillCheck } from "../actions/doctor.js"
import { CliLive } from "../layers.js"
import { visibleLength, padVisible, truncateVisible } from "../tui/ansi.js"
import { errorMessage } from "../util/cli-errors.js"
import { COMMAND_DESCRIPTIONS, COMMON_OPTION_DESCRIPTIONS } from "./metadata.js"

export function registerDoctorCommand(program: Command): void {
  program
    .command("doctor")
    .description(COMMAND_DESCRIPTIONS.doctor)
    .option("--all", "Check all known runtimes, not just those in schemas")
    .option("--ping", "Send a test prompt through each runtime to verify end-to-end")
    .option("--json", COMMON_OPTION_DESCRIPTIONS.json)
    .action(async (opts: { all?: boolean; ping?: boolean; json?: boolean }) => {
      const jsonOutput = opts.json ?? false
      const cols = process.stdout.columns ?? 80
      const isTTY = process.stdout.isTTY && !jsonOutput

      // Runtime health checks shell out to the runtime CLIs (`claude
      // auth status`, `opencode --version`, etc). Some of those CLIs
      // print startup banners straight to /dev/tty that bypass our
      // pipe, so a naive `\r\x1B[2K` progress line can end up with
      // foreign text stacked above it. We save the cursor on the
      // first tick and, on each subsequent tick, restore + erase to
      // end-of-screen so any leaked banner lines get wiped before we
      // redraw the spinner (and again before the final report).
      let spinnerInitialized = false
      const snapshot = await Effect.runPromise(
        doctorAction({
          includeAll: opts.all ?? false,
          onRuntimeProgress: isTTY
            ? (checked, total) => {
                if (!spinnerInitialized) {
                  process.stdout.write("\x1B[s") // save cursor
                  spinnerInitialized = true
                }
                process.stdout.write(
                  `\x1B[u\x1B[0J  ${chalk.dim(`Checking runtimes... ${checked}/${total}`)}`,
                )
                if (checked === total) {
                  // restore cursor + erase anything (subprocess noise
                  // + spinner) that was written below it.
                  process.stdout.write("\x1B[u\x1B[0J")
                }
              }
            : undefined,
        }).pipe(Effect.provide(CliLive)),
      )

      const { crevDir, runtimes, runtimeUsage, schemaReadiness, projectChecks, skills } = snapshot

      // --- Ping runs in the CLI today; moves to RuntimeExec service later. ---
      const config = loadLayeredConfig(crevDir)
      let pingResults: PingResult[] | undefined
      if (opts.ping) {
        const healthByRuntime = new Map(runtimes.map((h) => [h.name, h] as const))
        const allRuntimes = (await import("@caiokf/valet")).getAllRuntimes()
        const referenced = new Set(runtimes.map((r) => r.name))
        const pingable = allRuntimes.filter(
          (rt) => referenced.has(rt.name) || (opts.all ?? false),
        )
        const readyRuntimes = pingable.filter((rt) => {
          const health = healthByRuntime.get(rt.name)
          return health?.installed && health?.authenticated !== "no"
        })

        pingResults =
          readyRuntimes.length > 0
            ? await runPingTests(readyRuntimes, config, jsonOutput)
            : []
      }

      if (jsonOutput) {
        const payload = buildDoctorJsonPayload({
          healthResults: runtimes,
          runtimeUsage,
          schemaReadiness,
          projectChecks,
          skillChecks: skills,
          includePing: opts.ping ?? false,
          pingResults,
        })
        console.log(JSON.stringify(payload, null, 2))
        return
      }

      // --- Pretty output ---

      const nameColWidth =
        Math.max(
          14,
          ...runtimes.map((h) => {
            const rtConfig = getRuntimeConfig(config, h.name)
            const cmd = rtConfig.command ?? h.command ?? h.name
            return cmd !== h.name && cmd !== h.command
              ? h.name.length + cmd.length + 3
              : h.name.length
          }),
        ) + 2

      console.log(`\n  ${chalk.bold("Runtimes")}`)
      console.log(`  ${"─".repeat(Math.max(0, Math.min(60, cols - 4)))}`)

      for (const health of runtimes) {
        console.log(formatRuntimeLine(health, config, cols, nameColWidth))
      }

      if (runtimes.length === 0) {
        console.log(`  ${chalk.dim("No runtimes to check (no schemas found)")}`)
      }

      if (schemaReadiness.length > 0) {
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

      const checkColWidth = Math.max(...projectChecks.map((c) => c.name.length)) + 2
      console.log(`\n  ${chalk.bold("Project Setup")}`)
      console.log(`  ${"─".repeat(Math.max(0, Math.min(60, cols - 4)))}`)
      for (const check of projectChecks) {
        const icon = check.ok ? chalk.green("✓") : chalk.red("✗")
        console.log(`  ${check.name.padEnd(checkColWidth)} ${icon} ${check.detail}`)
      }

      if (skills.length > 0) {
        const skillColWidth = Math.max(...skills.map((s) => s.tool.length)) + 2
        console.log(`\n  ${chalk.bold("Skills")}`)
        console.log(`  ${"─".repeat(Math.max(0, Math.min(60, cols - 4)))}`)
        for (const skill of skills) {
          if (skill.upToDate) {
            console.log(`  ${skill.tool.padEnd(skillColWidth)} ${chalk.green("✓ up to date")}`)
          } else {
            console.log(
              `  ${skill.tool.padEnd(skillColWidth)} ${chalk.yellow("⚠ outdated")} ${chalk.dim("run `crev update`")}`,
            )
          }
        }
      }

      const brokenRuntimes = runtimes.filter((h) => h.authenticated === "no")
      if (brokenRuntimes.length > 0) {
        console.log()
        for (const rt of brokenRuntimes) {
          console.log(`  ${chalk.yellow("⚠")} Fix: ${rt.authDetail}`)
        }
      }

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
  skills: SkillCheck[]
  ping?: PingResult[]
}

export function buildDoctorJsonPayload(input: {
  healthResults: RuntimeHealth[]
  runtimeUsage: Map<string, string[]>
  schemaReadiness: SchemaReadiness[]
  projectChecks: ProjectCheck[]
  skillChecks: SkillCheck[]
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
    skills: input.skillChecks,
  }

  if (input.includePing) payload.ping = input.pingResults ?? []

  return payload
}

function formatRuntimeLine(
  health: RuntimeHealth,
  config: Config,
  cols: number,
  nameColWidth: number,
): string {
  const rtConfig = getRuntimeConfig(config, health.name)
  const commandName = rtConfig.command ?? health.command ?? health.name

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

  const parts: string[] = []
  parts.push(`  ${padVisible(nameLabel, nameColWidth)}`)
  parts.push(installed)

  if (cols >= 60 && health.installed) {
    const version = sanitizeVersion(health.version)
    parts.push(version.padEnd(10))
  }

  parts.push(auth)

  const line = parts.join("  ")

  if (cols >= 90 && health.authDetail) {
    const used = visibleLength(line) + 2
    const remaining = cols - used
    if (remaining > 10) {
      const detail = chalk.dim(sanitizeDetail(health.authDetail))
      return `${line}  ${truncateVisible(detail, remaining)}`
    }
  }

  return line
}

/**
 * Some runtime CLIs (notably mastracode) print a multi-line TUI
 * banner with hook info, ASCII-art, and stray control bytes when
 * invoked with `--version`. Valet captures the whole blob as the
 * `version` string; if we render it raw the doctor report gets
 * disfigured. Prefer a clean semver if one can be found, else fall
 * back to the first printable line, else an em-dash placeholder.
 */
export function sanitizeVersion(raw: string | null | undefined): string {
  if (!raw) return "–"
  const stripped = stripControl(raw)
  const semver = stripped.match(/\d+\.\d+\.\d+(?:[.-][A-Za-z0-9.-]+)?/)
  if (semver) return semver[0]
  const firstLine = stripped.split("\n").map((s) => s.trim()).find((s) => s.length > 0)
  return firstLine ? firstLine.slice(0, 20) : "–"
}

export function sanitizeDetail(raw: string): string {
  const firstLine = stripControl(raw).split("\n")[0].trim()
  return firstLine || "–"
}

function stripControl(s: string): string {
  // Strip ANSI escapes and non-printable control bytes (keep \n/\t
  // so split/trim can still see real line breaks).
  // eslint-disable-next-line no-control-regex
  return s.replace(/\x1B\[[0-9;?]*[a-zA-Z]|\x1B\][^\x07]*\x07/g, "").replace(
    // eslint-disable-next-line no-control-regex
    /[\x00-\x08\x0B-\x1F\x7F]/g,
    "",
  )
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
  const PING_PROMPT = "Respond with exactly this text and nothing else: hello ping-test"
  const results: PingResult[] = []

  const isTTY = process.stdout.isTTY && !jsonOutput

  const tasks = runtimes
    .filter((rt) => rt.supportsCustomPrompt)
    .map((rt) => ({
      runtime: rt,
      model: resolveModelAlias(config, rt.defaultModel),
    }))

  let pingSpinnerInitialized = false
  if (isTTY) {
    process.stdout.write("\n")
    process.stdout.write("\x1B[s") // save cursor before spinner
    pingSpinnerInitialized = true
    process.stdout.write(`  ${chalk.dim(`Running ping tests... 0/${tasks.length}`)}`)
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
        const pass =
          result.exitCode === 0 && result.raw.toLowerCase().includes("hello ping-test")
        results.push({
          runtime: runtime.name,
          model,
          pass,
          durationMs,
          error: pass
            ? undefined
            : result.exitCode !== 0
              ? `exit code ${result.exitCode}`
              : "unexpected output",
        })
      } catch (err) {
        results.push({
          runtime: runtime.name,
          model,
          pass: false,
          durationMs: performance.now() - start,
          error: errorMessage(err),
        })
      } finally {
        try {
          fs.unlinkSync(promptFile)
        } catch {}
        done++
        if (isTTY && pingSpinnerInitialized) {
          process.stdout.write(
            `\x1B[u\x1B[0J  ${chalk.dim(`Running ping tests... ${done}/${tasks.length}`)}`,
          )
        }
      }
    }),
  )

  if (isTTY && pingSpinnerInitialized) {
    process.stdout.write("\x1B[u\x1B[0J")
  }

  return results.sort((a, b) => a.runtime.localeCompare(b.runtime))
}
