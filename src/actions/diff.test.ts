import { describe, expect, vi } from "vitest"
import { it } from "@effect/vitest"
import { Effect, Exit } from "effect"

const diffMocks = vi.hoisted(() => ({
  resolveDiff: vi.fn(),
  cleanupDiffFile: vi.fn(),
}))

vi.mock("../core/diff.js", () => ({
  resolveDiff: diffMocks.resolveDiff,
  cleanupDiffFile: diffMocks.cleanupDiffFile,
}))

import { diffAction } from "./diff.js"
import { makeTestCrevConfig } from "../services/CrevConfig.js"
import { extractFailError } from "../util/cli-errors.js"

describe("diffAction", () => {
  it.effect("resolves a diff and returns it with a cleanup callback", () => {
    diffMocks.resolveDiff.mockReset()
    diffMocks.cleanupDiffFile.mockReset()
    diffMocks.resolveDiff.mockResolvedValue({
      diffContent: "line-1\nline-2",
      diffFile: "/tmp/preview.diff",
      type: "all",
    })

    const { layer } = makeTestCrevConfig({
      crevDir: "/repo/.crev",
      config: { diff: { exclude: ["**/*.md"] } },
    })

    return Effect.gen(function* () {
      const out = yield* diffAction({ source: { kind: "branch", base: "main", type: "all" } })
      expect(out.diff.diffContent).toBe("line-1\nline-2")
      expect(diffMocks.resolveDiff).toHaveBeenCalledWith({
        slug: "preview",
        source: { kind: "branch", base: "main", type: "all" },
        exclude: ["**/*.md"],
        crevDir: "/repo/.crev",
      })
      out.cleanup()
      expect(diffMocks.cleanupDiffFile).toHaveBeenCalledOnce()
    }).pipe(Effect.provide(layer))
  })

  it.effect("fails with DiffResolutionError when resolveDiff rejects", () => {
    diffMocks.resolveDiff.mockReset()
    diffMocks.resolveDiff.mockRejectedValue(new Error("fatal: not a git repo"))

    const { layer } = makeTestCrevConfig({ crevDir: "/repo/.crev", config: {} })

    return Effect.gen(function* () {
      const exit = yield* Effect.exit(
        diffAction({ source: { kind: "local", type: "all" } }),
      )
      expect(Exit.isFailure(exit)).toBe(true)
      if (Exit.isFailure(exit)) {
        const err = extractFailError(exit)
        expect(err?._tag).toBe("DiffResolutionError")
      }
    }).pipe(Effect.provide(layer))
  })
})
