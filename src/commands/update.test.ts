import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { Command } from "commander"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const skillMocks = vi.hoisted(() => ({
  writeSkill: vi.fn(),
  getInstalledSkills: vi.fn(),
}))

vi.mock("../util/skills.js", () => ({
  writeSkill: skillMocks.writeSkill,
  getInstalledSkills: skillMocks.getInstalledSkills,
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
    skillMocks.writeSkill.mockReset()
    skillMocks.getInstalledSkills.mockReset()
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

  it("prints a warning when no installed skills found", async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "crev-update-none-"))
    fs.mkdirSync(path.join(tmp, ".crev"), { recursive: true })
    skillMocks.getInstalledSkills.mockReturnValue([])

    await runUpdate([tmp])

    expect(logSpy.mock.calls.some(([msg]) => String(msg).includes("No installed crev skills found"))).toBe(true)
    expect(skillMocks.writeSkill).not.toHaveBeenCalled()

    fs.rmSync(tmp, { recursive: true, force: true })
  })

  it("regenerates skills only for tools with installed skills", async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "crev-update-installed-"))
    fs.mkdirSync(path.join(tmp, ".crev"), { recursive: true })

    const claude = { name: "Claude Code", id: "claude", detected: true, detectionPath: ".claude", skillPath: ".claude/skills/crev" }
    const cursor = { name: "Cursor", id: "cursor", detected: true, detectionPath: ".cursor", skillPath: ".cursor/skills/crev" }
    // getInstalledSkills returns only tools that have skill files — Gemini is excluded
    skillMocks.getInstalledSkills.mockReturnValue([claude, cursor])

    await runUpdate([tmp])

    expect(skillMocks.writeSkill).toHaveBeenCalledTimes(2)
    expect(skillMocks.writeSkill).toHaveBeenCalledWith(tmp, claude, true)
    expect(skillMocks.writeSkill).toHaveBeenCalledWith(tmp, cursor, true)
    expect(logSpy.mock.calls.some(([msg]) => String(msg).includes("Done."))).toBe(true)

    fs.rmSync(tmp, { recursive: true, force: true })
  })

  it("does not create skill files for tools that were not initialized", async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "crev-update-nocreate-"))
    fs.mkdirSync(path.join(tmp, ".crev"), { recursive: true })
    // Simulate: .claude and .cursor dirs exist, but only claude has an installed skill
    fs.mkdirSync(path.join(tmp, ".claude"), { recursive: true })
    fs.mkdirSync(path.join(tmp, ".cursor"), { recursive: true })

    const claude = { name: "Claude Code", id: "claude", detected: true, detectionPath: ".claude", skillPath: ".claude/skills/crev" }
    skillMocks.getInstalledSkills.mockReturnValue([claude])

    await runUpdate([tmp])

    // Only claude skill should be updated, not cursor
    expect(skillMocks.writeSkill).toHaveBeenCalledTimes(1)
    expect(skillMocks.writeSkill).toHaveBeenCalledWith(tmp, claude, true)

    fs.rmSync(tmp, { recursive: true, force: true })
  })
})
