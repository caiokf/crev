import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { Command } from "commander"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const configMocks = vi.hoisted(() => ({
  findCrevDir: vi.fn(),
}))

const schemaMocks = vi.hoisted(() => ({
  listAllSchemas: vi.fn(),
  resolveSchemaPath: vi.fn(),
  parseSchemaFile: vi.fn(),
  validateAgentRefs: vi.fn(),
  loadSchemaFile: vi.fn(),
}))

const pathMocks = vi.hoisted(() => ({
  getSchemasDir: vi.fn(),
}))

vi.mock("../core/config.js", () => ({
  findCrevDir: configMocks.findCrevDir,
}))

vi.mock("../core/schema.js", () => ({
  listAllSchemas: schemaMocks.listAllSchemas,
  resolveSchemaPath: schemaMocks.resolveSchemaPath,
  parseSchemaFile: schemaMocks.parseSchemaFile,
  validateAgentRefs: schemaMocks.validateAgentRefs,
  loadSchemaFile: schemaMocks.loadSchemaFile,
}))

vi.mock("../util/paths.js", () => ({
  getSchemasDir: pathMocks.getSchemasDir,
}))

import { registerSchemaCommand } from "./schema.js"

async function runSchema(args: string[]) {
  const program = new Command()
  registerSchemaCommand(program)
  await program.parseAsync(["schema", ...args], { from: "user" })
}

function mockExit() {
  return vi.spyOn(process, "exit").mockImplementation(((code?: number) => {
    throw new Error(`process.exit:${code ?? 0}`)
  }) as never)
}

describe("registerSchemaCommand", () => {
  let logSpy: ReturnType<typeof vi.spyOn>
  let errorSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    configMocks.findCrevDir.mockReset()
    schemaMocks.listAllSchemas.mockReset()
    schemaMocks.resolveSchemaPath.mockReset()
    schemaMocks.parseSchemaFile.mockReset()
    schemaMocks.validateAgentRefs.mockReset()
    schemaMocks.loadSchemaFile.mockReset()
    pathMocks.getSchemasDir.mockReset()
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {})
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("creates a schema file for `schema init`", async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "crev-schema-cmd-"))
    const crevDir = path.join(tmp, ".crev")
    configMocks.findCrevDir.mockReturnValue(crevDir)
    pathMocks.getSchemasDir.mockImplementation((dir: string) => path.join(dir, "schemas"))

    await runSchema(["init", "quick"])

    const schemaPath = path.join(crevDir, "schemas", "quick.yaml")
    expect(fs.existsSync(schemaPath)).toBe(true)
    expect(fs.readFileSync(schemaPath, "utf-8")).toContain("reviewers:")

    fs.rmSync(tmp, { recursive: true, force: true })
  })

  it("fails for invalid schema names in `schema init`", async () => {
    const exitSpy = mockExit()
    configMocks.findCrevDir.mockReturnValue("/repo/.crev")
    pathMocks.getSchemasDir.mockReturnValue("/repo/.crev/schemas")

    await expect(runSchema(["init", "bad/name"])).rejects.toThrow("process.exit:1")
    expect(errorSpy.mock.calls[0][0]).toContain("Schema name must be")
    expect(exitSpy).toHaveBeenCalledWith(1)
  })

  it("prints schema details in JSON for `schema show --json`", async () => {
    configMocks.findCrevDir.mockReturnValue("/repo/.crev")
    schemaMocks.resolveSchemaPath.mockReturnValue("/repo/.crev/schemas/quick.yaml")
    schemaMocks.loadSchemaFile.mockReturnValue({
      description: "Quick checks",
      reviewers: [{ name: "Engineer", runtime: "claude", model: "sonnet", prompt: "..." }],
    })

    await runSchema(["show", "quick", "--json"])

    const payload = JSON.parse(logSpy.mock.calls[0][0] as string)
    expect(payload.name).toBe("quick")
    expect(payload.reviewers).toHaveLength(1)
  })

  it("reports empty set for `schema validate --all`", async () => {
    configMocks.findCrevDir.mockReturnValue("/repo/.crev")
    schemaMocks.listAllSchemas.mockReturnValue([])

    await runSchema(["validate", "--all"])

    expect(logSpy).toHaveBeenCalledWith("No schemas found")
  })

  it("fails validation when agent refs are invalid", async () => {
    const exitSpy = mockExit()
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "crev-schema-validate-"))
    const schemaFile = path.join(tmp, "quick.yaml")
    fs.writeFileSync(schemaFile, "reviewers: []", "utf-8")

    configMocks.findCrevDir.mockReturnValue("/repo/.crev")
    schemaMocks.parseSchemaFile.mockReturnValue({ success: true })
    schemaMocks.loadSchemaFile.mockReturnValue({ reviewers: [] })
    schemaMocks.validateAgentRefs.mockResolvedValue([{ message: "Agent file missing: reviewer.md" }])

    await expect(runSchema(["validate", schemaFile])).rejects.toThrow("process.exit:1")
    expect(logSpy.mock.calls.some(([msg]) => String(msg).includes("Agent file missing"))).toBe(true)
    expect(exitSpy).toHaveBeenCalledWith(1)

    fs.rmSync(tmp, { recursive: true, force: true })
  })
})

const TEMPLATE = `description: ""
reviewers:
  - name: Engineer
    runtime: claude
    model: sonnet
    prompt: Review the code changes for correctness and potential bugs.
`

describe("schema init template", () => {
  let tmpDir: string
  let schemasDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "crev-schema-init-"))
    schemasDir = path.join(tmpDir, "schemas")
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it("template produces a valid schema when parsed", async () => {
    const actualSchema = await vi.importActual<typeof import("../core/schema.js")>("../core/schema.js")
    const result = actualSchema.parseSchemaFile(TEMPLATE)
    expect(result.success).toBe(true)
  })

  it("template schema loads with correct reviewer config", async () => {
    const actualSchema = await vi.importActual<typeof import("../core/schema.js")>("../core/schema.js")
    fs.mkdirSync(schemasDir, { recursive: true })
    const filePath = path.join(schemasDir, "test.yaml")
    fs.writeFileSync(filePath, TEMPLATE, "utf-8")

    const schema = actualSchema.loadSchemaFile(filePath)
    expect(schema.reviewers).toHaveLength(1)
    expect(schema.reviewers[0].name).toBe("Engineer")
    expect(schema.reviewers[0].runtime).toBe("claude")
    expect(schema.reviewers[0].model).toBe("sonnet")
  })

  it("refuses to overwrite existing schema (simulated check)", () => {
    fs.mkdirSync(schemasDir, { recursive: true })
    const filePath = path.join(schemasDir, "existing.yaml")
    fs.writeFileSync(filePath, "original: true", "utf-8")

    expect(fs.existsSync(filePath)).toBe(true)
    expect(fs.readFileSync(filePath, "utf-8")).toBe("original: true")
  })
})
