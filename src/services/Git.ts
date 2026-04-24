import { Context, Effect, Layer } from "effect"
import { execFile } from "node:child_process"
import { promisify } from "node:util"
import { GitError } from "../errors.js"

const execFileAsync = promisify(execFile)
const MAX_BUFFER = 50 * 1024 * 1024

export type DiffType = "all" | "committed" | "uncommitted"

export interface GitService {
  /** `git diff <base>` / `git diff <base>...HEAD` / `git diff`, based on `type`. */
  readonly diffBranch: (
    base: string,
    type: DiffType,
  ) => Effect.Effect<string, GitError>

  /** `git diff <sha>...HEAD`. */
  readonly diffCommit: (baseCommit: string) => Effect.Effect<string, GitError>

  /** `gh pr diff <pr>`. */
  readonly diffPr: (pr: string) => Effect.Effect<string, GitError>

  /** Staged, unstaged, or HEAD~1..HEAD — matches today's `--type` semantics. */
  readonly diffLocal: (type: DiffType) => Effect.Effect<string, GitError>

  /** `git ls-tree -r --name-only HEAD` — used to produce synthetic diffs for --analyze. */
  readonly listFilesAtHead: () => Effect.Effect<string[], GitError>

  /** Fails with GitError if HEAD doesn't exist (repo has no commits). */
  readonly verifyHead: () => Effect.Effect<void, GitError>
}

export class Git extends Context.Tag("crev/Git")<Git, GitService>() {}

function runGit(args: string[], bin: "git" | "gh" = "git"): Effect.Effect<string, GitError> {
  return Effect.tryPromise({
    try: async () => {
      const { stdout } = await execFileAsync(bin, args, { maxBuffer: MAX_BUFFER })
      return stdout
    },
    catch: (cause) =>
      new GitError({
        command: `${bin} ${args.join(" ")}`,
        reason: cause instanceof Error ? cause.message : String(cause),
        cause,
      }),
  })
}

export const GitLive = Layer.succeed(
  Git,
  Git.of({
    diffBranch: (base, type) => {
      if (type === "uncommitted") return runGit(["diff"])
      if (type === "committed") return runGit(["diff", `${base}...HEAD`])
      return runGit(["diff", base])
    },

    diffCommit: (baseCommit) => runGit(["diff", `${baseCommit}...HEAD`]),

    diffPr: (pr) => runGit(["pr", "diff", pr], "gh"),

    diffLocal: (type) => {
      if (type === "uncommitted") return runGit(["diff"])
      if (type === "committed") {
        return runGit(["diff", "HEAD~1..HEAD"]).pipe(
          Effect.catchTag("GitError", () =>
            // Initial-commit fallback: `HEAD~1` doesn't exist.
            runGit(["diff-tree", "-p", "--root", "HEAD"]),
          ),
        )
      }
      return Effect.gen(function* () {
        const staged = yield* runGit(["diff", "--staged"])
        const unstaged = yield* runGit(["diff"])
        return [staged, unstaged].filter(Boolean).join("\n")
      })
    },

    listFilesAtHead: () =>
      runGit(["ls-tree", "-r", "--name-only", "HEAD"]).pipe(
        Effect.map((stdout) => stdout.trim().split("\n").filter(Boolean)),
      ),

    verifyHead: () =>
      runGit(["rev-parse", "--verify", "HEAD"]).pipe(Effect.asVoid),
  }),
)

/**
 * Test layer — wire canned responses per command string.
 * Each entry is a matcher function against the joined args array;
 * first match wins. Unmatched commands fail with a GitError.
 */
export type GitStub = {
  readonly match: (args: string[], bin: "git" | "gh") => boolean
  readonly respond:
    | { readonly kind: "ok"; readonly stdout: string }
    | { readonly kind: "error"; readonly reason: string }
}

export const makeTestGit = (stubs: ReadonlyArray<GitStub>): { layer: Layer.Layer<Git> } => {
  const respond = (args: string[], bin: "git" | "gh"): Effect.Effect<string, GitError> => {
    for (const stub of stubs) {
      if (stub.match(args, bin)) {
        if (stub.respond.kind === "ok") return Effect.succeed(stub.respond.stdout)
        return Effect.fail(
          new GitError({
            command: `${bin} ${args.join(" ")}`,
            reason: stub.respond.reason,
            cause: null,
          }),
        )
      }
    }
    return Effect.fail(
      new GitError({
        command: `${bin} ${args.join(" ")}`,
        reason: "No stub matched",
        cause: null,
      }),
    )
  }

  const layer = Layer.succeed(
    Git,
    Git.of({
      diffBranch: (base, type) => {
        if (type === "uncommitted") return respond(["diff"], "git")
        if (type === "committed") return respond(["diff", `${base}...HEAD`], "git")
        return respond(["diff", base], "git")
      },
      diffCommit: (baseCommit) => respond(["diff", `${baseCommit}...HEAD`], "git"),
      diffPr: (pr) => respond(["pr", "diff", pr], "gh"),
      diffLocal: (type) => {
        if (type === "uncommitted") return respond(["diff"], "git")
        if (type === "committed") return respond(["diff", "HEAD~1..HEAD"], "git")
        return Effect.gen(function* () {
          const staged = yield* respond(["diff", "--staged"], "git")
          const unstaged = yield* respond(["diff"], "git")
          return [staged, unstaged].filter(Boolean).join("\n")
        })
      },
      listFilesAtHead: () =>
        respond(["ls-tree", "-r", "--name-only", "HEAD"], "git").pipe(
          Effect.map((stdout) => stdout.trim().split("\n").filter(Boolean)),
        ),
      verifyHead: () => respond(["rev-parse", "--verify", "HEAD"], "git").pipe(Effect.asVoid),
    }),
  )
  return { layer }
}
