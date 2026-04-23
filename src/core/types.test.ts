import { describe, expect, it } from "vitest"
import { RawDiffFlags, RawRunFlags, UserCancelledError } from "./types.js"

describe("UserCancelledError", () => {
  it("is an instance of Error", () => {
    const err = new UserCancelledError()
    expect(err).toBeInstanceOf(Error)
  })

  it("has the correct name", () => {
    const err = new UserCancelledError()
    expect(err.name).toBe("UserCancelledError")
  })

  it("has a descriptive message", () => {
    const err = new UserCancelledError()
    expect(err.message).toBe("Review cancelled by user.")
  })

  it("can be caught with instanceof", () => {
    try {
      throw new UserCancelledError()
    } catch (err) {
      expect(err instanceof UserCancelledError).toBe(true)
      expect(err instanceof Error).toBe(true)
    }
  })
})

describe("RawRunFlags validation", () => {
  const valid = { schema: "quick" }

  // ── Mutually exclusive diff sources ──

  it("rejects --pr with --base", () => {
    const result = RawRunFlags.safeParse({ ...valid, pr: 42, base: "main" })
    expect(result.success).toBe(false)
  })

  it("rejects --pr with --base-commit", () => {
    const result = RawRunFlags.safeParse({ ...valid, pr: 42, baseCommit: "abc123" })
    expect(result.success).toBe(false)
  })

  it("rejects --base with --base-commit", () => {
    const result = RawRunFlags.safeParse({ ...valid, base: "main", baseCommit: "abc123" })
    expect(result.success).toBe(false)
  })

  // ── Incompatible combos ──

  it("rejects --pr with --type uncommitted", () => {
    const result = RawRunFlags.safeParse({ ...valid, pr: 42, type: "uncommitted" })
    expect(result.success).toBe(false)
  })

  it("rejects --pr with --type committed", () => {
    const result = RawRunFlags.safeParse({ ...valid, pr: 42, type: "committed" })
    expect(result.success).toBe(false)
  })

  it("rejects --analyze with --base", () => {
    const result = RawRunFlags.safeParse({ ...valid, analyze: true, base: "main" })
    expect(result.success).toBe(false)
  })

  it("rejects --analyze with --pr", () => {
    const result = RawRunFlags.safeParse({ ...valid, analyze: true, pr: 42 })
    expect(result.success).toBe(false)
  })

  it("rejects --analyze with --base-commit", () => {
    const result = RawRunFlags.safeParse({ ...valid, analyze: true, baseCommit: "abc123" })
    expect(result.success).toBe(false)
  })

  it("rejects --prompt-only with --review-file", () => {
    const result = RawRunFlags.safeParse({ ...valid, promptOnly: true, reviewFile: "file.json" })
    expect(result.success).toBe(false)
  })

  it("rejects --slug with --review-file", () => {
    const result = RawRunFlags.safeParse({ ...valid, slug: "my-slug", reviewFile: "file.json" })
    expect(result.success).toBe(false)
  })

  it("rejects --slug with path traversal", () => {
    const result = RawRunFlags.safeParse({ ...valid, slug: "../../tmp/evil" })
    expect(result.success).toBe(false)
  })

  it("rejects --slug over 100 characters", () => {
    const result = RawRunFlags.safeParse({ ...valid, slug: "a".repeat(101) })
    expect(result.success).toBe(false)
  })

  it("accepts valid --slug values", () => {
    expect(RawRunFlags.safeParse({ ...valid, slug: "my-review" }).success).toBe(true)
    expect(RawRunFlags.safeParse({ ...valid, slug: "v1.2.3" }).success).toBe(true)
    expect(RawRunFlags.safeParse({ ...valid, slug: "feat_branch" }).success).toBe(true)
  })

  // ── Mutually exclusive output modes ──

  it("allows --plain with --json (CI mode)", () => {
    const result = RawRunFlags.parse({ ...valid, plain: true, json: true })
    expect(result.output).toEqual({ kind: "json" })
    expect(result.plain).toBe(true)
  })

  it("rejects --plain with --prompt-only", () => {
    const result = RawRunFlags.safeParse({ ...valid, plain: true, promptOnly: true })
    expect(result.success).toBe(false)
  })

  it("allows --json with --prompt-only", () => {
    const result = RawRunFlags.safeParse({ ...valid, json: true, promptOnly: true })
    expect(result.success).toBe(true)
    expect(result.success && result.data.output).toEqual({ kind: "prompt-only", format: "json" })
  })

  // ── Valid transforms ──

  it("--pr 42 → DiffSource { kind: 'pr', pr: 42 }", () => {
    const result = RawRunFlags.parse({ ...valid, pr: 42 })
    expect(result.diff).toEqual({ kind: "pr", pr: 42 })
  })

  it("--base main → DiffSource { kind: 'branch', base: 'main', type: 'all' }", () => {
    const result = RawRunFlags.parse({ ...valid, base: "main" })
    expect(result.diff).toEqual({ kind: "branch", base: "main", type: "all" })
  })

  it("--base-commit abc → DiffSource { kind: 'commit' }", () => {
    const result = RawRunFlags.parse({ ...valid, baseCommit: "abc" })
    expect(result.diff).toEqual({ kind: "commit", baseCommit: "abc", type: "all" })
  })

  it("no diff flags → DiffSource { kind: 'local', type: 'all' }", () => {
    const result = RawRunFlags.parse(valid)
    expect(result.diff).toEqual({ kind: "local", type: "all" })
  })

  it("--plain → OutputMode { kind: 'plain' }", () => {
    const result = RawRunFlags.parse({ ...valid, plain: true })
    expect(result.output).toEqual({ kind: "plain" })
  })

  it("--json → OutputMode { kind: 'json' }", () => {
    const result = RawRunFlags.parse({ ...valid, json: true })
    expect(result.output).toEqual({ kind: "json" })
  })

  it("--prompt-only → OutputMode { kind: 'prompt-only' }", () => {
    const result = RawRunFlags.parse({ ...valid, promptOnly: true })
    expect(result.output).toEqual({ kind: "prompt-only", format: "json" })
  })

  it("default → OutputMode { kind: 'tui' }", () => {
    const result = RawRunFlags.parse(valid)
    expect(result.output).toEqual({ kind: "tui" })
  })

  it("--review-file path → ReviewTarget { kind: 'merge' }", () => {
    const result = RawRunFlags.parse({ ...valid, reviewFile: "reviews/file.json" })
    expect(result.target).toEqual({ kind: "merge", reviewFile: "reviews/file.json" })
  })

  it("default → ReviewTarget { kind: 'fresh' }", () => {
    const result = RawRunFlags.parse(valid)
    expect(result.target).toEqual({ kind: "fresh", slug: undefined, description: undefined })
  })

  it("--reviewers parses comma-separated list", () => {
    const result = RawRunFlags.parse({ ...valid, reviewers: "Security, Architect" })
    expect(result.reviewers).toEqual(["Security", "Architect"])
  })

  it("--analyze sets analyze: true on the command", () => {
    const result = RawRunFlags.parse({ ...valid, analyze: true })
    expect(result.analyze).toBe(true)
    expect(result.diff).toEqual({ kind: "local", type: "all" })
  })

  it("schema is required", () => {
    const result = RawRunFlags.safeParse({})
    expect(result.success).toBe(false)
  })

  // ── --model transforms ──

  it("single --model string passes through as modelOverrides array", () => {
    const result = RawRunFlags.parse({ ...valid, model: "claude/sonnet" })
    expect(result.modelOverrides).toEqual(["claude/sonnet"])
  })

  it("multiple --model strings pass through as modelOverrides array", () => {
    const result = RawRunFlags.parse({ ...valid, model: ["claude/sonnet", "Engineer=claude/opus"] })
    expect(result.modelOverrides).toEqual(["claude/sonnet", "Engineer=claude/opus"])
  })

  it("no --model results in undefined modelOverrides", () => {
    const result = RawRunFlags.parse(valid)
    expect(result.modelOverrides).toBeUndefined()
  })
})

describe("RawDiffFlags validation", () => {
  it("rejects mutually exclusive source flags", () => {
    const result = RawDiffFlags.safeParse({ pr: 1, base: "main" })
    expect(result.success).toBe(false)
  })

  it("rejects invalid --type values", () => {
    const result = RawDiffFlags.safeParse({ type: "weird" })
    expect(result.success).toBe(false)
  })

  it("rejects --pr combined with non-all type", () => {
    const result = RawDiffFlags.safeParse({ pr: 12, type: "committed" })
    expect(result.success).toBe(false)
  })

  it("transforms valid flags into DiffSource", () => {
    const parsed = RawDiffFlags.parse({ baseCommit: "abc123", type: "all" })
    expect(parsed).toEqual({ kind: "commit", baseCommit: "abc123", type: "all" })
  })
})
