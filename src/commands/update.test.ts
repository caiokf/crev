import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { Command } from "commander"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const toolMocks = vi.hoisted(() => ({
  detectAITools: vi.fn(),
}))

const skillMocks = vi.hoisted(() => ({
  writeSkill: vi.fn(),
}))

vi.mock("../util/detect-tools.js", () => ({
  detectAITools: toolMocks.detectAITools,
}))

vi.mock("../util/skills.js", () => ({
  writeSkill: skillMocks.writeSkill,
}))

import { registerUpdateCommand } from "./update.js"

async function runUpdate(args: string[]) {
  const program = new Command()
  registerUpdateCommand(program)
  await program.parseAsync(["update", ...args], { from: "user" })
}

function mockExit() {
  return vi.spyOn(process, "exit").mockImplementation(((code?: number) => {
    throw new Error(`process.exit:${code ?? 0}`)
  }) as never)
}

describe("registerUpdateCommand", () => {
  let logSpy: ReturnType<typeof vi.spyOn>
  let errorSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    toolMocks.detectAITools.mockReset()
    skillMocks.writeSkill.mockReset()
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {})
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("fails when .crev directory is missing", async () => {
    const exitSpy = mockExit()
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "crev-update-missing-"))

    await expect(runUpdate([tmp])).rejects.toThrow("process.exit:1")
    expect(errorSpy.mock.calls[0][0]).toContain("No .crev directory found")
    expect(exitSpy).toHaveBeenCalledWith(1)

    fs.rmSync(tmp, { recursive: true, force: true })
  })

  it("prints a warning when no tools are detected", async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "crev-update-none-"))
    fs.mkdirSync(path.join(tmp, ".crev"), { recursive: true })
    toolMocks.detectAITools.mockReturnValue([
      { name: "Claude", id: "claude", detected: false, detectionPath: ".claude", skillPath: ".claude/skills/crev" },
    ])

    await runUpdate([tmp])

    expect(logSpy.mock.calls.some(([msg]) => String(msg).includes("No AI tools detected"))).toBe(true)
    expect(skillMocks.writeSkill).not.toHaveBeenCalled()

    fs.rmSync(tmp, { recursive: true, force: true })
  })

  it("regenerates skills for detected tools", async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "crev-update-detected-"))
    fs.mkdirSync(path.join(tmp, ".crev"), { recursive: true })

    const claude = { name: "Claude", id: "claude", detected: true, detectionPath: ".claude", skillPath: ".claude/skills/crev" }
    const cursor = { name: "Cursor", id: "cursor", detected: true, detectionPath: ".cursor", skillPath: ".cursor/skills/crev" }
    toolMocks.detectAITools.mockReturnValue([
      claude,
      cursor,
      { name: "Gemini", id: "gemini", detected: false, detectionPath: ".gemini", skillPath: ".gemini/commands" },
    ])

    await runUpdate([tmp])

    expect(skillMocks.writeSkill).toHaveBeenCalledTimes(2)
    expect(skillMocks.writeSkill).toHaveBeenCalledWith(tmp, claude, true)
    expect(skillMocks.writeSkill).toHaveBeenCalledWith(tmp, cursor, true)
    expect(logSpy.mock.calls.some(([msg]) => String(msg).includes("Done."))).toBe(true)

    fs.rmSync(tmp, { recursive: true, force: true })
  })
})
