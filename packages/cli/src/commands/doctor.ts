import fs from "node:fs"
import path from "node:path"
import type { Command } from "commander"
import chalk from "chalk"
import { getAllRuntimes, type RuntimeHealth } from "@crev/runtimes"
import { findCrevDir, loadConfig, getRuntimeConfig } from "../core/config.js"
import { listSchemas, loadSchemaFile } from "../core/schema.js"
import { getSchemasDir } from "../util/paths.js"
import { visibleLength, padVisible, truncateVisible } from "../ui/ansi.js"

export function registerDoctorCommand(program: Command): void {
  program
    .command("doctor")
    .description("Health check for runtimes and schemas")
    .option("--all", "Check all known runtimes, not just those in schemas")
    .option("--json", "Machine-readable JSON output")
    .action(async (opts) => {
      const crevDir = findCrevDir()
      const schemasDir = getSchemasDir(crevDir)
      const jsonOutput = opts.json ?? false
      const cols = process.stdout.columns ?? 80

      // Collect which runtimes are used by which schemas
      const schemas = listSchemas(schemasDir)
      const runtimeUsage = new Map<string, string[]>()
      const schemaLoadErrors = new Map<string, string>()
      for (const name of schemas) {
        try {
          const schema = loadSchemaFile(path.join(schemasDir, `${name}.yaml`))
          for (const reviewer of schema.reviewers) {
            const list = runtimeUsage.get(reviewer.runtime) ?? []
            list.push(name)
            runtimeUsage.set(reviewer.runtime, list)
          }
          if (schema.triage?.enabled && schema.triage.runtime) {
            const list = runtimeUsage.get(schema.triage.runtime) ?? []
            if (!list.includes(name)) list.push(name)
            runtimeUsage.set(schema.triage.runtime, list)
          }
        } catch (err) {
          schemaLoadErrors.set(name, err instanceof Error ? err.message : String(err))
        }
      }

      const config = loadConfig(crevDir)

      // Check all runtimes in parallel with simple progress indicator
      const allRuntimes = getAllRuntimes()
      const allHealthResults: RuntimeHealth[] = new Array(allRuntimes.length)

      const isTTY = process.stdout.isTTY && !jsonOutput
      let checked = 0

      if (isTTY) {
        process.stdout.write(`  ${chalk.dim(`Checking runtimes... 0/${allRuntimes.length}`)}`)
      }

      await Promise.all(
        allRuntimes.map(async (runtime, i) => {
          try {
            allHealthResults[i] = await runtime.healthCheck()
          } catch (e) {
            allHealthResults[i] = {
              name: runtime.name,
              command: runtime.name,
              installed: false,
              version: null,
              authenticated: "unknown",
              authDetail: String(e),
              error: String(e),
            }
          }
          checked++
          if (isTTY) {
            process.stdout.write(`\r\x1B[2K  ${chalk.dim(`Checking runtimes... ${checked}/${allRuntimes.length}`)}`)
          }
        }),
      )

      // Clear progress line
      if (isTTY) {
        process.stdout.write("\r\x1B[2K")
      }

      // By default show installed runtimes, --all shows everything
      const healthResults = opts.all
        ? allHealthResults
        : allHealthResults.filter((h) => h.installed)

      // Check project setup
      const projectChecks = checkProjectSetup(crevDir, schemasDir)

      // Determine schema readiness
      const schemaReadiness = schemas.map((name) => {
        try {
          const schema = loadSchemaFile(path.join(schemasDir, `${name}.yaml`))
          const issues: string[] = []
          for (const reviewer of schema.reviewers) {
            const health = allHealthResults.find((h) => h.name === reviewer.runtime)
            if (!health || !health.installed) {
              issues.push(`${reviewer.runtime}: not installed — reviewer "${reviewer.name}" will fail`)
            } else if (health.authenticated === "no") {
              issues.push(`${reviewer.runtime}: not authenticated — reviewer "${reviewer.name}" will fail`)
            }
          }
          if (schema.triage?.enabled && schema.triage.runtime) {
            const health = allHealthResults.find((h) => h.name === schema.triage!.runtime)
            if (!health || !health.installed) {
              issues.push(`${schema.triage.runtime}: not installed — triage will fail`)
            } else if (health.authenticated === "no") {
              issues.push(`${schema.triage.runtime}: not authenticated — triage will fail`)
            }
          }
          return { name, ready: issues.length === 0, issues }
        } catch (err) {
          const reason = err instanceof Error ? err.message : String(err)
          return { name, ready: false, issues: [`failed to load schema: ${reason}`] }
        }
      })

      if (jsonOutput) {
        console.log(
          JSON.stringify({
            runtimes: healthResults.map((h) => ({
              ...h,
              usedIn: runtimeUsage.get(h.name) ?? [],
            })),
            schemas: schemaReadiness,
            project: projectChecks,
          }, null, 2),
        )
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
        console.log(`\n  ${chalk.bold("Schemas")}`)
        console.log(`  ${"─".repeat(Math.max(0, Math.min(60, cols - 4)))}`)

        for (const schema of schemaReadiness) {
          if (schema.ready) {
            console.log(`  ${schema.name.padEnd(20)} ${chalk.green("✓ ready")}`)
          } else {
            console.log(`  ${schema.name.padEnd(20)} ${chalk.red("✗ not ready")}`)
            for (const issue of schema.issues) {
              console.log(`    ${chalk.dim(issue)}`)
            }
          }
        }
      }

      // Project setup
      console.log(`\n  ${chalk.bold("Project Setup")}`)
      console.log(`  ${"─".repeat(Math.max(0, Math.min(60, cols - 4)))}`)
      for (const check of projectChecks) {
        const icon = check.ok ? chalk.green("✓") : chalk.red("✗")
        console.log(`  ${check.name.padEnd(24)} ${icon} ${check.detail}`)
      }

      // Fix suggestions
      const brokenRuntimes = healthResults.filter((h) => h.authenticated === "no")
      if (brokenRuntimes.length > 0) {
        console.log()
        for (const rt of brokenRuntimes) {
          console.log(`  ${chalk.yellow("⚠")} Fix: ${rt.authDetail}`)
        }
      }

      console.log()
    })
}

type ProjectCheck = { name: string; ok: boolean; detail: string }

function checkProjectSetup(crevDir: string, schemasDir: string): ProjectCheck[] {
  const checks: ProjectCheck[] = []

  checks.push({
    name: ".crev/config.yaml",
    ok: fs.existsSync(path.join(crevDir, "config.yaml")),
    detail: fs.existsSync(path.join(crevDir, "config.yaml")) ? "valid" : "missing",
  })

  const schemaCount = listSchemas(schemasDir).length
  checks.push({
    name: ".crev/schemas/",
    ok: schemaCount > 0,
    detail: schemaCount > 0 ? `${schemaCount} schema${schemaCount !== 1 ? "s" : ""}` : "empty",
  })

  checks.push({
    name: ".crev/reviews/",
    ok: fs.existsSync(path.join(crevDir, "reviews")),
    detail: fs.existsSync(path.join(crevDir, "reviews")) ? "exists" : "missing",
  })

  checks.push({
    name: ".crev/diffs/",
    ok: fs.existsSync(path.join(crevDir, "diffs")),
    detail: fs.existsSync(path.join(crevDir, "diffs")) ? "exists" : "missing",
  })

  return checks
}


/**
 * Responsive runtime line — progressively adds detail based on terminal width.
 *
 * Narrow (< 60):  claude          ✓ installed  ✓ auth'd
 * Medium (60-90): claude          ✓ installed  2.1.81   ✓ auth'd
 * Wide   (> 90):  claude          ✓ installed  2.1.81   ✓ auth'd  env: ANTHROPIC_API_KEY
 */
function formatRuntimeLine(health: RuntimeHealth, config: ReturnType<typeof loadConfig>, cols: number, nameColWidth: number): string {
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

