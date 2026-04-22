import { Command } from "commander"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const configMocks = vi.hoisted(() => ({
  findCrevDir: vi.fn(),
}))

const schemaMocks = vi.hoisted(() => ({
  listAllSchemas: vi.fn(),
  resolveSchemaPath: vi.fn(),
  loadSchemaFile: vi.fn(),
}))

const valetMocks = vi.hoisted(() => ({
  getAllRuntimes: vi.fn(),
}))

vi.mock("../core/config.js", () => ({
  findCrevDir: configMocks.findCrevDir,
}))

vi.mock("../core/schema.js", () => ({
  listAllSchemas: schemaMocks.listAllSchemas,
  resolveSchemaPath: schemaMocks.resolveSchemaPath,
  loadSchemaFile: schemaMocks.loadSchemaFile,
}))

vi.mock("@caiokf/valet", () => ({
  getAllRuntimes: valetMocks.getAllRuntimes,
}))

import { registerListCommand } from "./list.js"

async function runList(args: string[]) {
  const program = new Command()
  registerListCommand(program)
  await program.parseAsync(["list", ...args], { from: "user" })
}

describe("registerListCommand", () => {
  let logSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    configMocks.findCrevDir.mockReset()
    schemaMocks.listAllSchemas.mockReset()
    schemaMocks.resolveSchemaPath.mockReset()
    schemaMocks.loadSchemaFile.mockReset()
    valetMocks.getAllRuntimes.mockReset()
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("prints schemas and runtimes as JSON", async () => {
    configMocks.findCrevDir.mockReturnValue("/repo/.crev")
    schemaMocks.listAllSchemas.mockReturnValue(["quick"])
    schemaMocks.resolveSchemaPath.mockReturnValue("/repo/.crev/schemas/quick.yaml")
    schemaMocks.loadSchemaFile.mockReturnValue({
      description: "Quick review",
      reviewers: [{}, {}],
    })
    valetMocks.getAllRuntimes.mockReturnValue([
      { name: "claude", type: "native", models: new Set(["sonnet", "opus"]), defaultModel: "sonnet" },
    ])

    await runList(["--json"])

    const payload = JSON.parse(logSpy.mock.calls[0][0] as string)
    expect(payload.schemas).toEqual([
      { name: "quick", description: "Quick review", reviewers: 2 },
    ])
    expect(payload.runtimes).toEqual([
      { name: "claude", type: "native", models: ["sonnet", "opus"], defaultModel: "sonnet" },
    ])
  })

  it("shows only runtimes when --runtimes is used", async () => {
    configMocks.findCrevDir.mockReturnValue("/repo/.crev")
    valetMocks.getAllRuntimes.mockReturnValue([
      { name: "codex", type: "native", models: new Set(["gpt-5"]), defaultModel: "gpt-5" },
    ])

    await runList(["--runtimes"])

    expect(schemaMocks.listAllSchemas).not.toHaveBeenCalled()
    expect(logSpy.mock.calls.some(([msg]) => String(msg).includes("Runtimes"))).toBe(true)
    expect(logSpy.mock.calls.some(([msg]) => String(msg).includes("codex"))).toBe(true)
  })
})
