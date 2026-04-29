import chalk from "chalk"
import type { RuntimeHealth } from "@caiokf/valet"
import { configSchema, getRuntimeConfig, type Config } from "../core/config.js"
import type { ProjectCheck, SchemaReadiness } from "../core/health.js"
import type { DoctorSnapshot, PingResult, SkillCheck } from "../actions/doctor.js"
import { visibleLength, padVisible, truncateVisible } from "../tui/ansi.js"
import { sanitizeDetail, sanitizeVersion } from "../util/sanitize.js"
import { separator } from "../util/terminal.js"

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

export function renderDoctorPretty(snapshot: DoctorSnapshot, cols: number): void {
  const { runtimes, schemaReadiness, projectChecks, skills, pingResults } = snapshot
  const config: Config = snapshot.config ?? configSchema.parse({})

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

  const sep = `  ${separator(cols)}`

  console.log(`\n  ${chalk.bold("Runtimes")}`)
  console.log(sep)
  for (const health of runtimes) {
    console.log(formatRuntimeLine(health, config, cols, nameColWidth))
  }
  if (runtimes.length === 0) {
    console.log(`  ${chalk.dim("No runtimes to check (no schemas found)")}`)
  }

  if (schemaReadiness.length > 0) {
    const schemaColWidth = Math.max(...schemaReadiness.map((s) => s.name.length)) + 2
    console.log(`\n  ${chalk.bold("Schemas")}`)
    console.log(sep)
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
  console.log(sep)
  for (const check of projectChecks) {
    const icon = check.ok ? chalk.green("✓") : chalk.red("✗")
    console.log(`  ${check.name.padEnd(checkColWidth)} ${icon} ${check.detail}`)
  }

  if (skills.length > 0) {
    const skillColWidth = Math.max(...skills.map((s) => s.tool.length)) + 2
    console.log(`\n  ${chalk.bold("Skills")}`)
    console.log(sep)
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

  if (pingResults !== undefined) {
    if (pingResults.length === 0) {
      console.log(`\n  ${chalk.dim("No runtimes available for ping test")}`)
    } else {
      console.log(`\n  ${chalk.bold("Ping")}`)
      console.log(sep)
      for (const r of pingResults) {
        const icon = r.pass ? chalk.green("✓") : chalk.red("✗")
        const time = chalk.dim(`${(r.durationMs / 1000).toFixed(1)}s`)
        const detail = r.pass ? time : `${time} ${chalk.dim(r.error ?? "")}`
        console.log(`  ${r.runtime.padEnd(14)} ${r.model.padEnd(22)} ${icon} ${detail}`)
      }
    }
  }

  console.log()
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
