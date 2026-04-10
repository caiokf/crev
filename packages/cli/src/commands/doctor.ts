import fs from "node:fs"
import path from "node:path"
import type { Command } from "commander"
import chalk from "chalk"
import { getAllRuntimes, getRuntime, type RuntimeHealth } from "@crev/runtimes"
import { findCrevDir } from "../core/config.js"
import { listSchemas, loadSchemaFile } from "../core/schema.js"
import { getSchemasDir } from "../util/paths.js"

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

      // Collect which runtimes are used by which schemas
      const schemas = listSchemas(schemasDir)
      const runtimeUsage = new Map<string, string[]>()
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
        } catch {}
      }

      // Determine which runtimes to check
      const runtimeNames = opts.all
        ? getAllRuntimes().map((r) => r.name)
        : [...runtimeUsage.keys()]

      // Run health checks
      const healthResults: RuntimeHealth[] = []
      for (const name of runtimeNames) {
        try {
          const runtime = getRuntime(name)
          healthResults.push(await runtime.healthCheck())
        } catch (e) {
          healthResults.push({
            name,
            command: name,
            installed: false,
            version: null,
            authenticated: "unknown",
            authDetail: String(e),
            error: String(e),
          })
        }
      }

      // Check project setup
      const projectChecks = checkProjectSetup(crevDir, schemasDir)

      // Determine schema readiness
      const schemaReadiness = schemas.map((name) => {
        try {
          const schema = loadSchemaFile(path.join(schemasDir, `${name}.yaml`))
          const issues: string[] = []
          for (const reviewer of schema.reviewers) {
            const health = healthResults.find((h) => h.name === reviewer.runtime)
            if (!health || !health.installed) {
              issues.push(`${reviewer.runtime}: not installed — reviewer "${reviewer.name}" will fail`)
            } else if (health.authenticated === "no") {
              issues.push(`${reviewer.runtime}: not authenticated — reviewer "${reviewer.name}" will fail`)
            }
          }
          return { name, ready: issues.length === 0, issues }
        } catch {
          return { name, ready: false, issues: ["failed to load schema"] }
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

      // Pretty print
      const title = opts.all ? "All Runtimes" : "Runtimes (referenced in your schemas)"
      console.log(`\n  ${chalk.bold(title)}`)
      console.log(`  ${"─".repeat(60)}`)

      for (const health of healthResults) {
        const installed = health.installed ? chalk.green("✓ installed") : chalk.red("✗ not found")
        const version = health.version ? chalk.white(health.version) : chalk.dim("—")
        const command = health.command ? chalk.dim(`(${health.command})`) : ""
        const auth =
          health.authenticated === "yes"
            ? chalk.green("✓ auth'd")
            : health.authenticated === "no"
              ? chalk.red("✗ no auth")
              : chalk.yellow("? unknown")
        const detail = health.authDetail ? chalk.dim(health.authDetail) : ""
        const usage = opts.all
          ? chalk.dim(`(${runtimeUsage.get(health.name)?.length ? `used in: ${runtimeUsage.get(health.name)!.join(", ")}` : "not used"})`)
          : ""

        console.log(`  ${chalk.cyan(health.name.padEnd(14))} ${installed}  ${(health.version ?? "—").padEnd(10)} ${command.padEnd(20)} ${auth} ${detail} ${usage}`)
      }

      if (healthResults.length === 0) {
        console.log(`  ${chalk.dim("No runtimes to check (no schemas found)")}`)
      }

      // Schema readiness
      if (schemas.length > 0) {
        console.log(`\n  ${chalk.bold("Schemas")}`)
        console.log(`  ${"─".repeat(60)}`)

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
      console.log(`  ${"─".repeat(60)}`)
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

  const agentsDir = path.join(crevDir, "agents")
  const agentCount = fs.existsSync(agentsDir)
    ? fs.readdirSync(agentsDir).filter((f) => f.endsWith(".md")).length
    : 0
  checks.push({
    name: ".crev/agents/",
    ok: agentCount > 0,
    detail: agentCount > 0 ? `${agentCount} agent${agentCount !== 1 ? "s" : ""}` : "empty",
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
