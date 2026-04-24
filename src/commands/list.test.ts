import { Command } from "commander"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// Shim-level tests. The list command is now a thin wrapper around
// `listSchemasAction` + `listRuntimesAction` from src/actions/list.ts;
// those are exercised in `src/actions/list.test.ts` against test layers.
//
// Here we only verify that the shim threads the right data through to
// stdout in JSON and pretty modes. We do that by stubbing the action
// modules via vi.mock — a small surface area kept intentionally narrow.

const actionMocks = vi.hoisted(() => ({
  listSchemasAction: { _tag: "Effect", mock: vi.fn() },
  listRuntimesAction: { _tag: "Effect", mock: vi.fn() },
}))

vi.mock("../actions/list.js", async () => {
  const { Effect } = await import("effect")
  return {
    listSchemasAction: Effect.suspend(() => {
      const result = actionMocks.listSchemasAction.mock()
      return Effect.succeed(result)
    }),
    listRuntimesAction: Effect.suspend(() => {
      const result = actionMocks.listRuntimesAction.mock()
      return Effect.succeed(result)
    }),
  }
})

import { registerListCommand } from "./list.js"

async function runList(args: string[]) {
  const program = new Command()
  registerListCommand(program)
  await program.parseAsync(["list", ...args], { from: "user" })
}

describe("registerListCommand (shim)", () => {
  let logSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    actionMocks.listSchemasAction.mock.mockReset()
    actionMocks.listRuntimesAction.mock.mockReset()
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("prints schemas and runtimes as JSON", async () => {
    actionMocks.listSchemasAction.mock.mockReturnValue([
      { name: "quick", description: "Quick review", reviewers: 2 },
    ])
    actionMocks.listRuntimesAction.mock.mockReturnValue([
      { name: "claude", type: "native", models: ["sonnet", "opus"], defaultModel: "sonnet" },
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
    actionMocks.listRuntimesAction.mock.mockReturnValue([
      { name: "codex", type: "native", models: ["gpt-5"], defaultModel: "gpt-5" },
    ])

    await runList(["--runtimes"])

    expect(actionMocks.listSchemasAction.mock).not.toHaveBeenCalled()
    expect(logSpy.mock.calls.some(([msg]) => String(msg).includes("Runtimes"))).toBe(true)
    expect(logSpy.mock.calls.some(([msg]) => String(msg).includes("codex"))).toBe(true)
  })
})
