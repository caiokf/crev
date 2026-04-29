import fs from "node:fs"
import os from "node:os"
import { Effect } from "effect"
import path from "node:path"
import { getAllRuntimes, type RuntimeAdapter, type RuntimeHealth } from "@caiokf/valet"
import { CrevConfig } from "../services/CrevConfig.js"
import { SchemaStore } from "../services/SchemaStore.js"
import { checkProjectSetup, checkSchemaReadiness } from "../core/health.js"
import type { ProjectCheck, SchemaReadiness } from "../core/health.js"
import { collectRuntimeHealthParallel, selectRuntimesToCheck } from "../core/runtimes.js"
import { getInstalledSkills, isSkillUpToDate } from "../util/skills.js"
import { getRuntimeConfig, resolveModelAlias, type Config } from "../core/config.js"
import { errorMessage } from "../util/cli-errors.js"
import type { ConfigParseError } from "../errors.js"

export type SkillCheck = {
  readonly tool: string
  readonly id: string
  readonly upToDate: boolean
}

export type PingResult = {
  runtime: string
  model: string
  pass: boolean
  durationMs: number
  error?: string
}

export type DoctorInput = {
  /** When true, check every known runtime; otherwise only those referenced by schemas. */
  readonly includeAll?: boolean
  /** Optional progress callback — called as each runtime finishes its health check. */
  readonly onRuntimeProgress?: (checked: number, total: number) => void
  /** When true, run a ping test through each ready runtime. */
  readonly includePing?: boolean
  /** Called with (0, total) before tasks start, then (done, total) as each completes. */
  readonly onPingProgress?: (done: number, total: number) => void
}

export type DoctorSnapshot = {
  readonly crevDir: string
  readonly config?: Config
  readonly runtimes: RuntimeHealth[]
  /** Schemas that reference each runtime name, keyed by runtime. */
  readonly runtimeUsage: Map<string, string[]>
  readonly schemaReadiness: SchemaReadiness[]
  readonly projectChecks: ProjectCheck[]
  readonly skills: SkillCheck[]
  /** Defined (possibly empty) only when includePing was true. */
  readonly pingResults?: PingResult[]
}

/**
 * Gather everything the `doctor` view needs in one pass: runtime
 * health, which schemas reference each runtime, schema readiness,
 * project-dir checks, skill freshness, and optional ping results.
 */
export const doctorAction = (
  input: DoctorInput = {},
): Effect.Effect<DoctorSnapshot, ConfigParseError, CrevConfig | SchemaStore> =>
  Effect.gen(function* () {
    const cfg = yield* CrevConfig
    const store = yield* SchemaStore
    const { crevDir, config } = yield* cfg.load()

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

    let pingResults: PingResult[] | undefined
    if (input.includePing) {
      const healthByRuntime = new Map(runtimes.map((h) => [h.name, h] as const))
      const readyRuntimes = runtimesToCheck.filter((rt) => {
        const health = healthByRuntime.get(rt.name)
        return health?.installed && health?.authenticated !== "no"
      })
      pingResults =
        readyRuntimes.length > 0
          ? yield* Effect.promise(() =>
              runPingTests(readyRuntimes, config, input.onPingProgress),
            )
          : []
    }

    return { crevDir, config, runtimes, runtimeUsage, schemaReadiness, projectChecks, skills, pingResults }
  })

function addUsage(usage: Map<string, string[]>, runtime: string, schemaName: string): void {
  const list = usage.get(runtime) ?? []
  if (!list.includes(schemaName)) list.push(schemaName)
  usage.set(runtime, list)
}

const PING_PROMPT = "Respond with exactly this text and nothing else: hello ping-test"

async function runPingTests(
  runtimes: RuntimeAdapter[],
  config: Config,
  onProgress?: (done: number, total: number) => void,
): Promise<PingResult[]> {
  const results: PingResult[] = []

  const tasks = runtimes
    .filter((rt) => rt.supportsCustomPrompt)
    .map((rt) => ({
      runtime: rt,
      model: resolveModelAlias(config, rt.defaultModel),
    }))

  onProgress?.(0, tasks.length)

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
        onProgress?.(done, tasks.length)
      }
    }),
  )

  return results.sort((a, b) => a.runtime.localeCompare(b.runtime))
}
