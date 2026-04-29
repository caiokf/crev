import { describe, expect } from "vitest"
import { it } from "@effect/vitest"
import { Effect, Exit } from "effect"
import { Git, makeTestGit } from "./Git.js"
import { extractFailError } from "../util/cli-errors.js"

describe("Git test layer", () => {
  it.effect("diffBranch routes 'all' to `git diff <base>`", () => {
    const { layer } = makeTestGit([
      {
        match: (args, bin) => bin === "git" && args[0] === "diff" && args[1] === "main",
        respond: { kind: "ok", stdout: "diff against main" },
      },
    ])

    return Effect.gen(function* () {
      const git = yield* Git
      const out = yield* git.diffBranch("main", "all")
      expect(out).toBe("diff against main")
    }).pipe(Effect.provide(layer))
  })

  it.effect("diffBranch routes 'committed' to the `<base>...HEAD` form", () => {
    const { layer } = makeTestGit([
      {
        match: (args) => args.includes("main...HEAD"),
        respond: { kind: "ok", stdout: "committed" },
      },
    ])

    return Effect.gen(function* () {
      const git = yield* Git
      const out = yield* git.diffBranch("main", "committed")
      expect(out).toBe("committed")
    }).pipe(Effect.provide(layer))
  })

  it.effect("diffPr shells out to `gh pr diff`", () => {
    const { layer } = makeTestGit([
      {
        match: (args, bin) => bin === "gh" && args[0] === "pr" && args[1] === "diff" && args[2] === "42",
        respond: { kind: "ok", stdout: "PR #42 diff" },
      },
    ])

    return Effect.gen(function* () {
      const git = yield* Git
      const out = yield* git.diffPr("42")
      expect(out).toBe("PR #42 diff")
    }).pipe(Effect.provide(layer))
  })

  it.effect("listFilesAtHead parses ls-tree output into trimmed paths", () => {
    const { layer } = makeTestGit([
      {
        match: (args) => args[0] === "ls-tree",
        respond: { kind: "ok", stdout: "src/a.ts\nsrc/b.ts\n\n" },
      },
    ])

    return Effect.gen(function* () {
      const git = yield* Git
      const files = yield* git.listFilesAtHead()
      expect(files).toEqual(["src/a.ts", "src/b.ts"])
    }).pipe(Effect.provide(layer))
  })

  it.effect("verifyHead fails with GitError when HEAD is absent", () => {
    const { layer } = makeTestGit([
      {
        match: (args) => args[0] === "rev-parse",
        respond: { kind: "error", reason: "fatal: no HEAD" },
      },
    ])

    return Effect.gen(function* () {
      const git = yield* Git
      const exit = yield* Effect.exit(git.verifyHead())
      expect(Exit.isFailure(exit)).toBe(true)
      if (Exit.isFailure(exit)) {
        const err = extractFailError(exit)
        expect(err?._tag).toBe("GitError")
      }
    }).pipe(Effect.provide(layer))
  })

  it.effect("diffLocal 'all' concatenates staged + unstaged", () => {
    const { layer } = makeTestGit([
      {
        match: (args) => args.includes("--staged"),
        respond: { kind: "ok", stdout: "STAGED" },
      },
      {
        match: (args) => args.length === 1 && args[0] === "diff",
        respond: { kind: "ok", stdout: "UNSTAGED" },
      },
    ])

    return Effect.gen(function* () {
      const git = yield* Git
      const out = yield* git.diffLocal("all")
      expect(out).toBe("STAGED\nUNSTAGED")
    }).pipe(Effect.provide(layer))
  })
})
