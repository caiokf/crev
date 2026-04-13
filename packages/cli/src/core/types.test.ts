import { describe, expect, it } from "vitest"
import { RawRunFlags } from "./types.js"

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

  it("rejects --type current-state with --base", () => {
    const result = RawRunFlags.safeParse({ ...valid, type: "current-state", base: "main" })
    expect(result.success).toBe(false)
  })

  it("rejects --type current-state with --pr", () => {
    const result = RawRunFlags.safeParse({ ...valid, type: "current-state", pr: 42 })
    expect(result.success).toBe(false)
  })

  it("rejects --type current-state with --base-commit", () => {
    const result = RawRunFlags.safeParse({ ...valid, type: "current-state", baseCommit: "abc123" })
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

  it("rejects --json with --prompt-only", () => {
    const result = RawRunFlags.safeParse({ ...valid, json: true, promptOnly: true })
    expect(result.success).toBe(false)
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

  it("--type current-state → DiffSource { kind: 'local', type: 'current-state' }", () => {
    const result = RawRunFlags.parse({ ...valid, type: "current-state" })
    expect(result.diff).toEqual({ kind: "local", type: "current-state" })
  })

  it("schema is required", () => {
    const result = RawRunFlags.safeParse({})
    expect(result.success).toBe(false)
  })
})
