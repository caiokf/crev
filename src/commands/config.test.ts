import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { Command } from "commander"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const configMocks = vi.hoisted(() => ({
  findCrevDir: vi.fn(),
  getConfigLayerPaths: vi.fn(),
  loadAnnotatedConfig: vi.fn(),
}))

vi.mock("../core/config.js", () => ({
  findCrevDir: configMocks.findCrevDir,
  getConfigLayerPaths: configMocks.getConfigLayerPaths,
  loadAnnotatedConfig: configMocks.loadAnnotatedConfig,
}))

import { registerConfigCommand } from "./config.js"

async function runConfig(args: string[]) {
  const program = new Command()
  registerConfigCommand(program)
  await program.parseAsync(["config", ...args], { from: "user" })
}

describe("registerConfigCommand", () => {
  let logSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    configMocks.findCrevDir.mockReset()
    configMocks.getConfigLayerPaths.mockReset()
    configMocks.loadAnnotatedConfig.mockReset()
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("prints resolved config with provenance as JSON", async () => {
    configMocks.findCrevDir.mockReturnValue("/tmp/project/.crev")
    configMocks.loadAnnotatedConfig.mockReturnValue({
      config: { output: { format: "json" } },
      provenance: { "output.format": ".crev/config.yaml" },
    })

    await runConfig(["--json"])

    expect(logSpy).toHaveBeenCalledTimes(1)
    const payload = JSON.parse(logSpy.mock.calls[0][0] as string)
    expect(payload).toEqual({
      config: { output: { format: "json" } },
      provenance: { "output.format": ".crev/config.yaml" },
    })
  })

  it("prints layer status as JSON when --layers is enabled", async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "crev-config-layers-"))
    const existing = path.join(tmp, "existing.yaml")
    const missing = path.join(tmp, "missing.yaml")
    fs.writeFileSync(existing, "x: 1", "utf-8")

    configMocks.findCrevDir.mockReturnValue(tmp)
    configMocks.getConfigLayerPaths.mockReturnValue([
      { label: "project", path: existing },
      { label: "home", path: missing },
    ])

    await runConfig(["--layers", "--json"])

    const payload = JSON.parse(logSpy.mock.calls[0][0] as string)
    expect(payload).toEqual([
      { label: "project", path: existing, exists: true },
      { label: "home", path: missing, exists: false },
    ])

    fs.rmSync(tmp, { recursive: true, force: true })
  })

  it("keeps provenance annotations distinct when YAML has repeated line text", async () => {
    configMocks.findCrevDir.mockReturnValue("/tmp/project/.crev")
    configMocks.loadAnnotatedConfig.mockReturnValue({
      config: {
        normalizer: { enabled: true },
        triage: { enabled: true },
      },
      provenance: {
        "normalizer.enabled": "~/.crev/config.yaml",
        "triage.enabled": ".crev/config.local.yaml",
      },
    })

    await runConfig([])

    const renderedLines = logSpy.mock.calls.map(([line]) => String(line))
    const enabledLines = renderedLines.filter((line) => line.includes("enabled: true"))
    expect(enabledLines).toHaveLength(2)
    expect(enabledLines[0]).toContain("# ~/.crev/config.yaml")
    expect(enabledLines[1]).toContain("# .crev/config.local.yaml")
  })
})
