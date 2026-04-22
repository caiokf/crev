import { Command } from "commander"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { VALID_MODELS } from "../core/schema.js"
import { registerHelpCommand } from "./help.js"

async function runHelp(args: string[]) {
  const program = new Command()
  registerHelpCommand(program)
  await program.parseAsync(["help", ...args], { from: "user" })
}

describe("help command content", () => {
  let logSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {})
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
})
