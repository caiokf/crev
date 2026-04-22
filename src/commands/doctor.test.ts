import { Command } from "commander"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { buildDoctorJsonPayload } from "./doctor.js"

const valetMocks = vi.hoisted(() => ({
  getAllRuntimes: vi.fn(),
}))

const configMocks = vi.hoisted(() => ({
  findCrevDir: vi.fn(),
  loadLayeredConfig: vi.fn(),
  getRuntimeConfig: vi.fn(),
  resolveModelAlias: vi.fn(),
}))

const healthMocks = vi.hoisted(() => ({
  collectRuntimeHealth: vi.fn(),
  checkSchemaReadiness: vi.fn(),
  checkProjectSetup: vi.fn(),
}))

const schemaMocks = vi.hoisted(() => ({
  listAllSchemas: vi.fn(),
  resolveSchemaPath: vi.fn(),
  loadSchemaFile: vi.fn(),
}))

vi.mock("@caiokf/valet", () => ({
  getAllRuntimes: valetMocks.getAllRuntimes,
}))

vi.mock("../core/config.js", () => ({
  findCrevDir: configMocks.findCrevDir,
  loadLayeredConfig: configMocks.loadLayeredConfig,
  getRuntimeConfig: configMocks.getRuntimeConfig,
  resolveModelAlias: configMocks.resolveModelAlias,
}))

vi.mock("../core/health.js", () => ({
  collectRuntimeHealth: healthMocks.collectRuntimeHealth,
  checkSchemaReadiness: healthMocks.checkSchemaReadiness,
  checkProjectSetup: healthMocks.checkProjectSetup,
}))

vi.mock("../core/schema.js", () => ({
  listAllSchemas: schemaMocks.listAllSchemas,
  resolveSchemaPath: schemaMocks.resolveSchemaPath,
  loadSchemaFile: schemaMocks.loadSchemaFile,
}))

import { registerDoctorCommand } from "./doctor.js"

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

describe("registerDoctorCommand --ping", () => {
  let logSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    vi.resetAllMocks()
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {})
    configMocks.findCrevDir.mockReturnValue("/repo/.crev")
    configMocks.loadLayeredConfig.mockReturnValue({ aliases: {}, runtimes: {} })
    configMocks.getRuntimeConfig.mockReturnValue({})
    configMocks.resolveModelAlias.mockReturnValue("sonnet")
    schemaMocks.listAllSchemas.mockReturnValue([])
    healthMocks.collectRuntimeHealth.mockResolvedValue(healthResults)
    healthMocks.checkSchemaReadiness.mockReturnValue(schemaReadiness)
    healthMocks.checkProjectSetup.mockReturnValue(projectChecks)
    valetMocks.getAllRuntimes.mockReturnValue([
      { name: "claude", supportsCustomPrompt: true, defaultModel: "sonnet" },
    ])
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("filters runtimes correctly for ping without crashing", async () => {
    const program = new Command()
    registerDoctorCommand(program)
    await program.parseAsync(["doctor", "--ping", "--json"], { from: "user" })

    const output = JSON.parse(logSpy.mock.calls[0][0] as string)
    expect(output.ping).toBeDefined()
  })

  it("returns empty ping results when no runtimes are ready", async () => {
    healthMocks.collectRuntimeHealth.mockResolvedValue([
      { ...healthResults[0], installed: false, authenticated: "no" },
    ])

    const program = new Command()
    registerDoctorCommand(program)
    await program.parseAsync(["doctor", "--ping", "--json"], { from: "user" })

    const output = JSON.parse(logSpy.mock.calls[0][0] as string)
    expect(output.ping).toEqual([])
  })
})

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
