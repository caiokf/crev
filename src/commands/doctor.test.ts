import { describe, expect, it } from "vitest"
import { buildDoctorJsonPayload } from "./doctor.js"

const healthResults = [
  {
    name: "claude",
    command: "claude",
    installed: true,
    version: "2.1.0",
    authenticated: "yes" as const,
    authDetail: "ok",
    error: null,
  },
]

const schemaReadiness = [
  { name: "quick", ready: true, issues: [] },
]

const projectChecks = [
  { name: ".crev/config.yaml", ok: true, detail: "valid" },
]

describe("buildDoctorJsonPayload", () => {
  it("includes runtime usage mapping", () => {
    const runtimeUsage = new Map<string, string[]>([["claude", ["quick"]]])
    const payload = buildDoctorJsonPayload({
      healthResults,
      runtimeUsage,
      schemaReadiness,
      projectChecks,
      includeSmoke: false,
    })

    expect(payload.runtimes[0].usedIn).toEqual(["quick"])
  })

  it("does not include smoke when includeSmoke is false", () => {
    const payload = buildDoctorJsonPayload({
      healthResults,
      runtimeUsage: new Map(),
      schemaReadiness,
      projectChecks,
      includeSmoke: false,
    })

    expect("smoke" in payload).toBe(false)
  })

  it("includes empty smoke list when includeSmoke is true and results are missing", () => {
    const payload = buildDoctorJsonPayload({
      healthResults,
      runtimeUsage: new Map(),
      schemaReadiness,
      projectChecks,
      includeSmoke: true,
    })

    expect(payload.smoke).toEqual([])
  })

  it("includes provided smoke results when includeSmoke is true", () => {
    const payload = buildDoctorJsonPayload({
      healthResults,
      runtimeUsage: new Map(),
      schemaReadiness,
      projectChecks,
      includeSmoke: true,
      smokeResults: [
        {
          runtime: "claude",
          model: "sonnet",
          pass: true,
          durationMs: 123,
        },
      ],
    })

    expect(payload.smoke).toEqual([
      {
        runtime: "claude",
        model: "sonnet",
        pass: true,
        durationMs: 123,
      },
    ])
  })
})
