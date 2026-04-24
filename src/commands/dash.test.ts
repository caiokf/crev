import { Command } from "commander"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// The dash shim just refuses to launch in non-TTY contexts and
// otherwise delegates to `runDash`. The real blessed app shell is
// exercised interactively; here we only guard the contract: "give
// a clean error instead of blowing up on CI".

const dashMocks = vi.hoisted(() => ({
  runDash: vi.fn(),
}))

vi.mock("../dash/index.js", () => ({
  runDash: dashMocks.runDash,
}))

import { registerDashCommand } from "./dash.js"

async function runDashCommand() {
  const program = new Command()
  program.exitOverride()
  registerDashCommand(program)
  try {
    await program.parseAsync(["dash"], { from: "user" })
  } catch (err) {
    if (err instanceof Error && err.message === "__PROCESS_EXIT__") return
    throw err
  }
}

describe("registerDashCommand (shim)", () => {
  let errSpy: ReturnType<typeof vi.spyOn>
  let exitCalls: Array<string | number | null | undefined>
  const originalIsTTY = process.stdout.isTTY
  const originalExit = process.exit

  beforeEach(() => {
    dashMocks.runDash.mockReset()
    dashMocks.runDash.mockResolvedValue(undefined)
    errSpy = vi.spyOn(console, "error").mockImplementation(() => {})
    exitCalls = []
    // process.exit has a `never` return; throw a sentinel so callers
    // that expect `exitWithError(...)` to abort control flow behave as
    // they would in production.
    process.exit = ((code?: string | number | null) => {
      exitCalls.push(code)
      throw new Error("__PROCESS_EXIT__")
    }) as typeof process.exit
  })

  afterEach(() => {
    vi.restoreAllMocks()
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore — node's types allow undefined here
    process.stdout.isTTY = originalIsTTY
    process.exit = originalExit
  })

  it("refuses to launch when stdout is not a TTY", async () => {
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    process.stdout.isTTY = false

    await runDashCommand()

    expect(dashMocks.runDash).not.toHaveBeenCalled()
    expect(errSpy).toHaveBeenCalled()
    expect(exitCalls).toEqual([1])
  })

  it("calls runDash when stdout is a TTY", async () => {
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    process.stdout.isTTY = true

    await runDashCommand()

    expect(dashMocks.runDash).toHaveBeenCalledTimes(1)
    expect(errSpy).not.toHaveBeenCalled()
  })
})
