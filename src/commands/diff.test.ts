import { Command } from "commander"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const configMocks = vi.hoisted(() => ({
  findCrevDir: vi.fn(),
  loadLayeredConfig: vi.fn(),
}))

const diffMocks = vi.hoisted(() => ({
  resolveDiff: vi.fn(),
  cleanupDiffFile: vi.fn(),
}))

vi.mock("../core/config.js", () => ({
  findCrevDir: configMocks.findCrevDir,
  loadLayeredConfig: configMocks.loadLayeredConfig,
}))

vi.mock("../core/diff.js", () => ({
  resolveDiff: diffMocks.resolveDiff,
  cleanupDiffFile: diffMocks.cleanupDiffFile,
}))

import { registerDiffCommand } from "./diff.js"

async function runDiff(args: string[]) {
  const program = new Command()
  registerDiffCommand(program)
  await program.parseAsync(["diff", ...args], { from: "user" })
}

function mockExit() {
  return vi.spyOn(process, "exit").mockImplementation(((code?: number) => {
    throw new Error(`process.exit:${code ?? 0}`)
  }) as never)
}

describe("registerDiffCommand", () => {
  let logSpy: ReturnType<typeof vi.spyOn>
  let errorSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    configMocks.findCrevDir.mockReset()
    configMocks.loadLayeredConfig.mockReset()
    diffMocks.resolveDiff.mockReset()
    diffMocks.cleanupDiffFile.mockReset()
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {})
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("fails on mutually exclusive source flags", async () => {
    const exitSpy = mockExit()
    await expect(runDiff(["--pr", "12", "--base", "main"])).rejects.toThrow("process.exit:1")
    expect(errorSpy).toHaveBeenCalledOnce()
    expect(diffMocks.resolveDiff).not.toHaveBeenCalled()
    expect(exitSpy).toHaveBeenCalledWith(1)
  })

  it("fails on invalid diff type", async () => {
    const exitSpy = mockExit()
    await expect(runDiff(["--type", "weird"])).rejects.toThrow("process.exit:1")
    expect(errorSpy.mock.calls[0][0]).toContain("Invalid --type")
    expect(exitSpy).toHaveBeenCalledWith(1)
  })

  it("resolves and prints diff preview for a branch source", async () => {
    configMocks.findCrevDir.mockReturnValue("/repo/.crev")
    configMocks.loadLayeredConfig.mockReturnValue({ diff: { exclude: ["**/*.md"] } })
    diffMocks.resolveDiff.mockResolvedValue({
      diffContent: "line-1\nline-2\nline-3",
      filePath: "/tmp/preview.diff",
    })

    await runDiff(["--base", "main", "--type", "all"])

    expect(diffMocks.resolveDiff).toHaveBeenCalledWith({
      slug: "preview",
      source: { kind: "branch", base: "main", type: "all" },
      exclude: ["**/*.md"],
      crevDir: "/repo/.crev",
    })
    expect(logSpy.mock.calls.some(([msg]) => String(msg).includes("Diff: 3 lines"))).toBe(true)
    expect(logSpy.mock.calls.some(([msg]) => msg === "line-1\nline-2\nline-3")).toBe(true)
    expect(diffMocks.cleanupDiffFile).toHaveBeenCalledOnce()
  })
})
