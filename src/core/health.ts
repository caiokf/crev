import fs from "node:fs"
import path from "node:path"
import { getAllRuntimes, type RuntimeHealth } from "@caiokf/valet"
import { listAllSchemas, resolveSchemaPath, loadSchemaFile } from "./schema.js"
import { errorMessage } from "../util/cli-errors.js"

export type SchemaReadiness = {
  name: string
  ready: boolean
  issues: string[]
}

export type ProjectCheck = {
  name: string
  ok: boolean
  detail: string
}

/**
 * Run healthCheck() on all runtimes in parallel.
 * Returns results in the same order as getAllRuntimes().
 */
export async function collectRuntimeHealth(
  onProgress?: (checked: number, total: number) => void,
): Promise<RuntimeHealth[]> {
  const allRuntimes = getAllRuntimes()
  const results: RuntimeHealth[] = new Array(allRuntimes.length)
  let checked = 0

  await Promise.all(
    allRuntimes.map(async (runtime, i) => {
      try {
        results[i] = await runtime.healthCheck()
      } catch (e) {
        results[i] = {
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
      onProgress?.(checked, allRuntimes.length)
    }),
  )

  return results
}

/**
 * Check each schema's readiness: are all reviewer/triage runtimes installed and auth'd?
 */
export function checkSchemaReadiness(
  crevDir: string,
  healthResults: RuntimeHealth[],
): SchemaReadiness[] {
  const schemas = listAllSchemas(crevDir)

  return schemas.map((name) => {
    try {
      const resolved = resolveSchemaPath(name, crevDir)
      if (!resolved) return { name, ready: false, issues: ["Schema file not found"] }
      const schema = loadSchemaFile(resolved)
      const issues: string[] = []

      for (const reviewer of schema.reviewers) {
        const health = healthResults.find((h) => h.name === reviewer.runtime)
        if (!health || !health.installed) {
          issues.push(`${reviewer.runtime}: not installed — reviewer "${reviewer.name}" will fail`)
        } else if (health.authenticated === "no") {
          issues.push(`${reviewer.runtime}: not authenticated — reviewer "${reviewer.name}" will fail`)
        }
      }

      if (schema.triage?.enabled && schema.triage.runtime) {
        const health = healthResults.find((h) => h.name === schema.triage!.runtime)
        if (!health || !health.installed) {
          issues.push(`${schema.triage.runtime}: not installed — triage will fail`)
        } else if (health.authenticated === "no") {
          issues.push(`${schema.triage.runtime}: not authenticated — triage will fail`)
        }
      }

      return { name, ready: issues.length === 0, issues }
    } catch (err) {
      return { name, ready: false, issues: [`failed to load schema: ${errorMessage(err)}`] }
    }
  })
}

/**
 * Check project directory setup (config, schemas, reviews).
 */
export function checkProjectSetup(crevDir: string): ProjectCheck[] {
  const checks: ProjectCheck[] = []

  const configExists = fs.existsSync(path.join(crevDir, "config.yaml"))
  checks.push({
    name: ".crev/config.yaml",
    ok: configExists,
    detail: configExists ? "valid" : "missing",
  })

  const schemaCount = listAllSchemas(crevDir).length
  checks.push({
    name: ".crev/schemas/",
    ok: schemaCount > 0,
    detail: schemaCount > 0 ? `${schemaCount} schema${schemaCount !== 1 ? "s" : ""}` : "empty",
  })

  const reviewsExist = fs.existsSync(path.join(crevDir, "reviews"))
  checks.push({
    name: ".crev/reviews/",
    ok: reviewsExist,
    detail: reviewsExist ? "exists" : "missing",
  })

  return checks
}
