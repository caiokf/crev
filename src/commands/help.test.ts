import { Command } from "commander"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { VALID_MODELS } from "../core/schema.js"
import { registerConfigCommand } from "./config.js"
import { registerDiffCommand } from "./diff.js"
import { registerDoctorCommand } from "./doctor.js"
import { getFullReference, registerHelpCommand } from "./help.js"
import { registerInitCommand } from "./init.js"
import { registerListCommand } from "./list.js"
import { registerRunCommand } from "./run.js"
import { registerSchemaCommand } from "./schema.js"
import { registerShowCommand } from "./show.js"
import { registerStatsCommand } from "./stats.js"
import { registerUpdateCommand } from "./update.js"

async function runHelp(args: string[]) {
  const program = new Command()
  registerHelpCommand(program)
  await program.parseAsync(["help", ...args], { from: "user" })
}

function buildProgram(): Command {
  const program = new Command()
  registerRunCommand(program)
  registerListCommand(program)
  registerShowCommand(program)
  registerDiffCommand(program)
  registerDoctorCommand(program)
  registerHelpCommand(program)
  registerSchemaCommand(program)
  registerInitCommand(program)
  registerUpdateCommand(program)
  registerStatsCommand(program)
  registerConfigCommand(program)
  return program
}

function findCommandByPath(program: Command, name: string): Command | undefined {
  const parts = name.split(" ")
  let current: Command | undefined = program

  for (const part of parts) {
    current = current.commands.find((c) => c.name() === part)
    if (!current) return undefined
  }

  return current
}

describe("help command content", () => {
  let logSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("VALID_MODELS contains all expected runtimes", () => {
    expect(Object.keys(VALID_MODELS)).toEqual(
      expect.arrayContaining(["claude", "codex", "gemini", "kimi", "coderabbit", "opencode"]),
    )
  })

  it("each runtime has at least one model", () => {
    for (const [runtime, models] of Object.entries(VALID_MODELS)) {
      expect(models.length, `${runtime} should have models`).toBeGreaterThan(0)
    }
  })

  it("prints machine-readable reference with --json", async () => {
    await runHelp(["--json"])
    const payload = JSON.parse(logSpy.mock.calls[0][0] as string)
    expect(payload.commands.some((c: { name: string }) => c.name === "run")).toBe(true)
    expect(payload.runtimes.length).toBeGreaterThan(0)
  })

  it("prints topic help for run", async () => {
    await runHelp(["run"])
    expect(logSpy.mock.calls.some(([msg]) => String(msg).includes("crev run"))).toBe(true)
  })

  it("keeps help --json command flags aligned with registered Commander options", () => {
    const program = buildProgram()
    const reference = getFullReference() as {
      commands: Array<{ name: string; flags?: string[] }>
    }

    for (const entry of reference.commands) {
      const cmd = findCommandByPath(program, entry.name)
      expect(cmd, `Missing command in registration: ${entry.name}`).toBeDefined()

      const declaredFlags = new Set((cmd?.options ?? []).map((opt) => opt.long).filter(Boolean))
      for (const flag of entry.flags ?? []) {
        expect(
          declaredFlags.has(flag),
          `Command "${entry.name}" is missing flag "${flag}" declared in help --json`,
        ).toBe(true)
      }
    }
  })
})
