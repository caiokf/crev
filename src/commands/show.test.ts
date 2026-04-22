import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { Command } from "commander"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const configMocks = vi.hoisted(() => ({
  findCrevDir: vi.fn(),
  loadLayeredConfig: vi.fn(),
  getOutputDir: vi.fn(),
}))

vi.mock("../core/config.js", () => ({
  findCrevDir: configMocks.findCrevDir,
  loadLayeredConfig: configMocks.loadLayeredConfig,
  getOutputDir: configMocks.getOutputDir,
}))

import { registerShowCommand } from "./show.js"

async function runShow(args: string[]) {
  const program = new Command()
  registerShowCommand(program)
  await program.parseAsync(["show", ...args], { from: "user" })
}

function mockExit() {
  return vi.spyOn(process, "exit").mockImplementation(((code?: number) => {
    throw new Error(`process.exit:${code ?? 0}`)
  }) as never)
}

describe("registerShowCommand", () => {
  let logSpy: ReturnType<typeof vi.spyOn>
  let errorSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    configMocks.findCrevDir.mockReset()
    configMocks.loadLayeredConfig.mockReset()
    configMocks.getOutputDir.mockReset()
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {})
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("fails when no review file exists", async () => {
    const exitSpy = mockExit()
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "crev-show-empty-"))

    configMocks.findCrevDir.mockReturnValue("/repo/.crev")
    configMocks.loadLayeredConfig.mockReturnValue({ output: { format: "json" } })
    configMocks.getOutputDir.mockReturnValue(tmp)

    await expect(runShow([])).rejects.toThrow("process.exit:1")
    expect(errorSpy.mock.calls[0][0]).toContain("No review files found")
    expect(exitSpy).toHaveBeenCalledWith(1)

    fs.rmSync(tmp, { recursive: true, force: true })
  })

  it("fails when an explicit file does not exist", async () => {
    const exitSpy = mockExit()
    configMocks.findCrevDir.mockReturnValue("/repo/.crev")

    await expect(runShow(["/tmp/does-not-exist-review.json"])).rejects.toThrow("process.exit:1")
    expect(errorSpy.mock.calls[0][0]).toContain("not found")
    expect(exitSpy).toHaveBeenCalledWith(1)
  })

  it("prints raw review JSON with --json", async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "crev-show-json-"))
    const file = path.join(tmp, "review.json")
    const content = JSON.stringify({
      metadata: { slug: "run-1", schema: "quick", timestamp: "2026-04-22T00:00:00.000Z", diffType: "local" },
      reviews: [],
      summary: { totalIssues: 0 },
    })
    fs.writeFileSync(file, content, "utf-8")

    configMocks.findCrevDir.mockReturnValue("/repo/.crev")
    await runShow([file, "--json"])

    expect(logSpy).toHaveBeenCalledWith(content)
    fs.rmSync(tmp, { recursive: true, force: true })
  })

  it("uses the latest review file by default", async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "crev-show-latest-"))
    const oldFile = path.join(tmp, "2026-04-21-old.json")
    const newFile = path.join(tmp, "2026-04-22-new.json")
    fs.writeFileSync(
      oldFile,
      JSON.stringify({ metadata: { slug: "old", schema: "quick", timestamp: "", diffType: "local" }, reviews: [], summary: { totalIssues: 0 } }),
      "utf-8",
    )
    const newContent = JSON.stringify({
      metadata: { slug: "new", schema: "quick", timestamp: "", diffType: "local" },
      reviews: [],
      summary: { totalIssues: 0 },
    })
    fs.writeFileSync(newFile, newContent, "utf-8")

    configMocks.findCrevDir.mockReturnValue("/repo/.crev")
    configMocks.loadLayeredConfig.mockReturnValue({ output: { format: "json" } })
    configMocks.getOutputDir.mockReturnValue(tmp)

    await runShow(["--json"])

    expect(logSpy).toHaveBeenCalledWith(newContent)
    fs.rmSync(tmp, { recursive: true, force: true })
  })
})
