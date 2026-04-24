import { Effect } from "effect"
import path from "node:path"
import { getAllRuntimes, type RuntimeHealth } from "@caiokf/valet"
import { CrevConfig } from "../services/CrevConfig.js"
import { SchemaStore } from "../services/SchemaStore.js"
import { checkProjectSetup, checkSchemaReadiness } from "../core/health.js"
import type { ProjectCheck, SchemaReadiness } from "../core/health.js"
import { collectRuntimeHealthParallel, selectRuntimesToCheck } from "../core/runtimes.js"
import { getInstalledSkills, isSkillUpToDate } from "../util/skills.js"
import type { ConfigParseError } from "../errors.js"

export type SkillCheck = {
  readonly tool: string
  readonly id: string
  readonly upToDate: boolean
}

export type DoctorInput = {
  /** When true, check every known runtime; otherwise only those referenced by schemas. */
  readonly includeAll?: boolean
  /** Optional progress callback — called as each runtime finishes its health check. */
  readonly onRuntimeProgress?: (checked: number, total: number) => void
}

export type DoctorSnapshot = {
  readonly crevDir: string
  readonly runtimes: RuntimeHealth[]
  /** Schemas that reference each runtime name, keyed by runtime. */
  readonly runtimeUsage: Map<string, string[]>
  readonly schemaReadiness: SchemaReadiness[]
  readonly projectChecks: ProjectCheck[]
  readonly skills: SkillCheck[]
}

/**
 * Gather everything the `doctor` view needs in one pass: runtime
 * health, which schemas reference each runtime, schema readiness,
 * project-dir checks, and skill freshness. `--ping` lives in the
 * CLI layer because it needs the live RuntimeExec (Task #7).
 */
export const doctorAction = (
  input: DoctorInput = {},
): Effect.Effect<DoctorSnapshot, ConfigParseError, CrevConfig | SchemaStore> =>
  Effect.gen(function* () {
    const cfg = yield* CrevConfig
    const store = yield* SchemaStore
    const { crevDir } = yield* cfg.load()

    const schemaNames = yield* store.listAll(crevDir)

    const runtimeUsage = new Map<string, string[]>()
    const referenced = new Set<string>()

    for (const name of schemaNames) {
      const resolved = yield* store.resolvePath(name, crevDir)
      if (!resolved) continue
      const schema = yield* Effect.either(store.load(resolved))
      if (schema._tag === "Left") continue

      for (const reviewer of schema.right.reviewers) {
        referenced.add(reviewer.runtime)
        addUsage(runtimeUsage, reviewer.runtime, name)
      }
      const triage = schema.right.triage
      if (triage?.enabled && triage.runtime) {
        referenced.add(triage.runtime)
        addUsage(runtimeUsage, triage.runtime, name)
      }
      const fix = schema.right.fix
      if (fix?.runtime) {
        referenced.add(fix.runtime)
        addUsage(runtimeUsage, fix.runtime, name)
      }
    }

    const allRuntimes = getAllRuntimes()
    const runtimesToCheck = selectRuntimesToCheck(
      allRuntimes,
      referenced,
      input.includeAll ?? false,
    )

    const runtimes = yield* Effect.promise(() =>
      collectRuntimeHealthParallel(runtimesToCheck, input.onRuntimeProgress),
    )

    const schemaReadiness = yield* Effect.sync(() => checkSchemaReadiness(crevDir, runtimes))
    const projectChecks = yield* Effect.sync(() => checkProjectSetup(crevDir))

    const projectRoot = path.dirname(crevDir)
    const skills = yield* Effect.sync(() =>
      getInstalledSkills(projectRoot).map((tool) => ({
        tool: tool.name,
        id: tool.id,
        upToDate: isSkillUpToDate(projectRoot, tool),
      })),
    )

    return { crevDir, runtimes, runtimeUsage, schemaReadiness, projectChecks, skills }
  })

function addUsage(usage: Map<string, string[]>, runtime: string, schemaName: string): void {
  const list = usage.get(runtime) ?? []
  if (!list.includes(schemaName)) list.push(schemaName)
  usage.set(runtime, list)
}
