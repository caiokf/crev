import { Command } from "commander"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// Shim-level tests. The show command is now a thin wrapper around
// `showAction` from src/actions/show.ts; that action is exercised in
// `src/actions/show.test.ts` against test layers.
//
// Here we only verify that the shim maps action results/errors to stdout
// and the exit-on-error behavior users depend on.

const actionMocks = vi.hoisted(() => ({
  showAction: vi.fn(),
}))

vi.mock("../actions/show.js", async () => {
  const { Effect } = await import("effect")
  return {
    showAction: (input: unknown) =>
      Effect.suspend(() => {
        const result = actionMocks.showAction(input)
        if (result && typeof result === "object" && "_op" in result) {
          return result as ReturnType<typeof Effect.succeed>
        }
        return Effect.succeed(result)
      }),
  }
})

import { showAction as _ } from "../actions/show.js"
void _
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

const fixtureResult = {
  metadata: {
    slug: "run-1",
    schema: "quick",
    timestamp: "2026-04-22T00:00:00.000Z",
    diffType: "local" as const,
  },
  reviews: [],
  summary: { totalIssues: 0, bySeverity: {}, byCategory: {}, byReviewer: {} },
}

describe("registerShowCommand (shim)", () => {
  let logSpy: ReturnType<typeof vi.spyOn>
  let errorSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    actionMocks.showAction.mockReset()
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {})
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("exits with error when no reviews found", async () => {
    const exitSpy = mockExit()
    const { Effect } = await import("effect")
    const { ReviewNotFoundError } = await import("../errors.js")

    actionMocks.showAction.mockReturnValue(
      Effect.fail(new ReviewNotFoundError({ outputDir: "/repo/.crev/reviews" })),
    )

    await expect(runShow([])).rejects.toThrow("process.exit:1")
    expect(errorSpy.mock.calls[0][0]).toContain("No review files found")
    expect(exitSpy).toHaveBeenCalledWith(1)
  })

  it("exits with error when an explicit file does not exist", async () => {
    const exitSpy = mockExit()
    const { Effect } = await import("effect")
    const { FileNotFoundError } = await import("../errors.js")

    actionMocks.showAction.mockReturnValue(
      Effect.fail(new FileNotFoundError({ path: "/tmp/does-not-exist-review.json" })),
    )

    await expect(runShow(["/tmp/does-not-exist-review.json"])).rejects.toThrow("process.exit:1")
    expect(errorSpy.mock.calls[0][0]).toContain("not found")
    expect(exitSpy).toHaveBeenCalledWith(1)
  })

  it("prints raw review JSON with --json", async () => {
    actionMocks.showAction.mockReturnValue({
      filePath: "/out/review.json",
      result: fixtureResult,
      isLatest: false,
    })

    await runShow(["/out/review.json", "--json"])

    const payload = JSON.parse(logSpy.mock.calls[0][0] as string)
    expect(payload.metadata.slug).toBe("run-1")
  })

  it("passes the explicit file to showAction", async () => {
    actionMocks.showAction.mockReturnValue({
      filePath: "/out/review.json",
      result: fixtureResult,
      isLatest: false,
    })

    await runShow(["/out/review.json", "--json"])

    expect(actionMocks.showAction).toHaveBeenCalledWith({ filePath: "/out/review.json" })
  })

  it("calls showAction with no filePath when none is provided", async () => {
    actionMocks.showAction.mockReturnValue({
      filePath: "/out/latest.json",
      result: fixtureResult,
      isLatest: true,
    })

    await runShow(["--json"])

    expect(actionMocks.showAction).toHaveBeenCalledWith({ filePath: undefined })
  })
})
