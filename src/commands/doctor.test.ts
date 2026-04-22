import { Command } from "commander"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { buildDoctorJsonPayload, sanitizeRuntimeHealth, selectRuntimesToCheck } from "./doctor.js"

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
    configMocks.getRuntimeConfig.mockReturnValue({ env: {}, args: [] })
    configMocks.resolveModelAlias.mockImplementation((_config, model: string) => model)
    schemaMocks.listAllSchemas.mockReturnValue(["quick"])
    schemaMocks.resolveSchemaPath.mockReturnValue("/repo/.crev/schemas/quick.yaml")
    schemaMocks.loadSchemaFile.mockReturnValue({
      reviewers: [{ name: "Engineer", runtime: "claude" }],
    })
    healthMocks.checkSchemaReadiness.mockReturnValue(schemaReadiness)
    healthMocks.checkProjectSetup.mockReturnValue(projectChecks)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("includes ping results when runtime is healthy", async () => {
    valetMocks.getAllRuntimes.mockReturnValue([
      {
        name: "claude",
        supportsCustomPrompt: true,
        defaultModel: "sonnet",
        healthCheck: vi.fn().mockResolvedValue(healthResults[0]),
        execute: vi.fn().mockResolvedValue({
          raw: "hello ping-test",
          exitCode: 0,
          durationMs: 10,
        }),
      },
    ])

    const program = new Command()
    registerDoctorCommand(program)
    await program.parseAsync(["doctor", "--ping", "--json"], { from: "user" })

    const output = JSON.parse(logSpy.mock.calls[0][0] as string)
    expect(output.ping).toBeDefined()
    expect(output.ping).toHaveLength(1)
    expect(output.ping[0].runtime).toBe("claude")
    expect(output.ping[0].pass).toBe(true)
  })

  it("returns empty ping results when no runtimes are ready", async () => {
    valetMocks.getAllRuntimes.mockReturnValue([
      {
        name: "claude",
        supportsCustomPrompt: true,
        defaultModel: "sonnet",
        healthCheck: vi.fn().mockResolvedValue({ ...healthResults[0], installed: false, authenticated: "no" }),
        execute: vi.fn(),
      },
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

  it("deduplicates usedIn runtime usage entries", () => {
    const runtimeUsage = new Map<string, string[]>([["claude", ["quick", "quick", "standard"]]])
    const payload = buildDoctorJsonPayload({
      healthResults,
      runtimeUsage,
      schemaReadiness,
      projectChecks,
      includePing: false,
    })

    expect(payload.runtimes[0].usedIn).toEqual(["quick", "standard"])
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

describe("sanitizeRuntimeHealth", () => {
  it("normalizes control-sequence-heavy fields to single-line readable text", () => {
    const raw = {
      name: "mastracode",
      command: "mastracode",
      installed: true,
      version: "v0.1\n\u001b[31mRED\u001b[0m\tok",
      authenticated: "unknown" as const,
      authDetail: "line1\r\nline2",
      error: "\u001b[2Kerr",
    }

    const sanitized = sanitizeRuntimeHealth(raw)
    expect(sanitized.version).toBe("v0.1 RED ok")
    expect(sanitized.authDetail).toBe("line1 line2")
    expect(sanitized.error).toBe("err")
  })
})

describe("selectRuntimesToCheck", () => {
  const runtimes = [
    { name: "claude" },
    { name: "gemini" },
    { name: "codex" },
  ] as const

  it("checks only schema-referenced runtimes by default", () => {
    const selected = selectRuntimesToCheck(runtimes, new Set(["gemini", "claude"]), false)
    expect(selected.map((r) => r.name)).toEqual(["claude", "gemini"])
  })

  it("checks all runtimes when --all is enabled", () => {
    const selected = selectRuntimesToCheck(runtimes, new Set(["gemini"]), true)
    expect(selected.map((r) => r.name)).toEqual(["claude", "gemini", "codex"])
  })
})
