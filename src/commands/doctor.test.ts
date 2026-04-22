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
      includePing: false,
    })

    expect(payload.runtimes[0].usedIn).toEqual(["quick"])
  })

  it("does not include ping when includePing is false", () => {
    const payload = buildDoctorJsonPayload({
      healthResults,
      runtimeUsage: new Map(),
      schemaReadiness,
      projectChecks,
      includePing: false,
    })

    expect("ping" in payload).toBe(false)
  })

  it("includes empty ping list when includePing is true and results are missing", () => {
    const payload = buildDoctorJsonPayload({
      healthResults,
      runtimeUsage: new Map(),
      schemaReadiness,
      projectChecks,
      includePing: true,
    })

    expect(payload.ping).toEqual([])
  })

  it("includes provided ping results when includePing is true", () => {
    const payload = buildDoctorJsonPayload({
      healthResults,
      runtimeUsage: new Map(),
      schemaReadiness,
      projectChecks,
      includePing: true,
      pingResults: [
        {
          runtime: "claude",
          model: "sonnet",
          pass: true,
          durationMs: 123,
        },
      ],
    })

    expect(payload.ping).toEqual([
      {
        runtime: "claude",
        model: "sonnet",
        pass: true,
        durationMs: 123,
      },
    ])
  })
})
