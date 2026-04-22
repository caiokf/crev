import { describe, expect, it, vi } from "vitest"
import { isRetryable, getFailback, parseFailbackKey, withResilience } from "./resilience.js"
import type { Config } from "./config.js"

// Minimal config factory with failback entries
function makeConfig(failback: Record<string, string> = {}): Config {
  return {
    defaults: { schema: "quick", type: "all", base: "main" },
    runtimes: {},
    aliases: {},
    diff: { exclude: [] },
    output: { dir: ".crev/reviews", format: "json" },
    normalizer: { enabled: true, runtime: "claude", model: "haiku" },
    failback,
    triage: {
      enabled: false,
      runtime: "claude",
      model: "opus",
      deduplicate: false,
      recategorize: false,
      enrichComments: false,
      prompt: "",
    },
  }
}

describe("isRetryable", () => {
  it("returns retryable for generic errors", () => {
    const result = isRetryable(new Error("connection reset"))
    expect(result.retryable).toBe(true)
  })

  it("returns not retryable for AbortError", () => {
    const err = new Error("Aborted")
    err.name = "AbortError"
    const result = isRetryable(err)
    expect(result.retryable).toBe(false)
    expect(result.reason).toContain("cancelled")
  })

  it("returns not retryable for authentication errors", () => {
    expect(isRetryable(new Error("Authentication failed")).retryable).toBe(false)
    expect(isRetryable(new Error("unauthorized access")).retryable).toBe(false)
    expect(isRetryable(new Error("invalid API key")).retryable).toBe(false)
  })

  it("returns not retryable for model not found", () => {
    expect(isRetryable(new Error("model not found: gpt-99")).retryable).toBe(false)
    expect(isRetryable(new Error("Invalid model specified")).retryable).toBe(false)
  })

  it("returns not retryable for missing runtime (ENOENT)", () => {
    expect(isRetryable(new Error("spawn claude ENOENT")).retryable).toBe(false)
    expect(isRetryable(new Error("command not found: codex")).retryable).toBe(false)
  })

  it("returns retryable for transient 'not found' errors (DNS, API 404)", () => {
    expect(isRetryable(new Error("server not found")).retryable).toBe(true)
    expect(isRetryable(new Error("resource not found")).retryable).toBe(true)
    expect(isRetryable(new Error("endpoint not found")).retryable).toBe(true)
  })

  it("returns retryable for non-Error values", () => {
    expect(isRetryable("some string error").retryable).toBe(true)
    expect(isRetryable(42).retryable).toBe(true)
    expect(isRetryable(null).retryable).toBe(true)
  })
})

describe("parseFailbackKey", () => {
  it("parses valid runtime/model key", () => {
    expect(parseFailbackKey("claude/opus")).toEqual({ runtime: "claude", model: "opus" })
  })

  it("returns null for invalid keys", () => {
    expect(parseFailbackKey("claude")).toBeNull()
    expect(parseFailbackKey("")).toBeNull()
    expect(parseFailbackKey("/opus")).toBeNull()
    expect(parseFailbackKey("claude/")).toBeNull()
    expect(parseFailbackKey("a/b/c")).toBeNull()
  })
})

describe("getFailback", () => {
  it("returns failback target when configured", () => {
    const config = makeConfig({ "claude/opus": "claude/sonnet" })
    expect(getFailback(config, "claude", "opus")).toEqual({ runtime: "claude", model: "sonnet" })
  })

  it("returns null when no failback configured", () => {
    const config = makeConfig({})
    expect(getFailback(config, "claude", "opus")).toBeNull()
  })

  it("returns null for invalid failback target", () => {
    const config = makeConfig({ "claude/opus": "invalid" })
    expect(getFailback(config, "claude", "opus")).toBeNull()
  })

  it("supports cross-runtime failback", () => {
    const config = makeConfig({ "codex/o3": "claude/sonnet" })
    expect(getFailback(config, "codex", "o3")).toEqual({ runtime: "claude", model: "sonnet" })
  })
})

describe("withResilience", () => {
  it("returns on first success without retry", async () => {
    const fn = vi.fn().mockResolvedValue({ data: "ok" })
    const config = makeConfig()
    const result = await withResilience(fn, "claude", "opus", config)
    expect(result.data).toBe("ok")
    expect(fn).toHaveBeenCalledTimes(1)
    expect(fn).toHaveBeenCalledWith("claude", "opus")
  })

  it("retries once on retryable error then succeeds", async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error("rate limited"))
      .mockResolvedValueOnce({ data: "retry ok" })
    const config = makeConfig()
    const result = await withResilience(fn, "claude", "opus", config)
    expect(result.data).toBe("retry ok")
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it("falls back to failback chain after retry failure", async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error("rate limited"))
      .mockRejectedValueOnce(new Error("still rate limited"))
      .mockResolvedValueOnce({ data: "fallback ok" })
    const config = makeConfig({ "claude/opus": "claude/sonnet" })
    const result = await withResilience(fn, "claude", "opus", config)
    expect(result.data).toBe("fallback ok")
    expect(result.fallback).toBeDefined()
    expect(result.fallback!.originalRuntime).toBe("claude")
    expect(result.fallback!.originalModel).toBe("opus")
    expect(fn).toHaveBeenCalledTimes(3)
    expect(fn).toHaveBeenNthCalledWith(3, "claude", "sonnet")
  })

  it("throws immediately on non-retryable error (no retry)", async () => {
    const err = new Error("Aborted")
    err.name = "AbortError"
    const fn = vi.fn().mockRejectedValue(err)
    const config = makeConfig({ "claude/opus": "claude/sonnet" })
    await expect(withResilience(fn, "claude", "opus", config)).rejects.toThrow("Aborted")
    expect(fn).toHaveBeenCalledTimes(1) // no retry
  })

  it("throws after all attempts exhausted (no failback configured)", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("rate limited"))
    const config = makeConfig({}) // no failback
    await expect(withResilience(fn, "claude", "opus", config)).rejects.toThrow("rate limited")
    expect(fn).toHaveBeenCalledTimes(2) // original + 1 retry, no failback
  })

  it("throws after failback also fails", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("everything is down"))
    const config = makeConfig({ "claude/opus": "claude/sonnet" })
    await expect(withResilience(fn, "claude", "opus", config)).rejects.toThrow("everything is down")
    expect(fn).toHaveBeenCalledTimes(3) // original + retry + failback
  })

  it("throws immediately when signal is already aborted", async () => {
    const controller = new AbortController()
    controller.abort()
    const fn = vi.fn().mockRejectedValue(new Error("aborted"))
    const config = makeConfig({ "claude/opus": "claude/sonnet" })
    await expect(withResilience(fn, "claude", "opus", config, controller.signal)).rejects.toThrow()
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it("does not retry when retry itself is non-retryable", async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error("rate limited"))
      .mockRejectedValueOnce(new Error("authentication failed"))
    const config = makeConfig({ "claude/opus": "claude/sonnet" })
    await expect(withResilience(fn, "claude", "opus", config)).rejects.toThrow("authentication")
    expect(fn).toHaveBeenCalledTimes(2) // original + retry, no failback because retry was non-retryable
  })

  it("includes reason in fallback metadata", async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error("503 overloaded"))
      .mockRejectedValueOnce(new Error("503 overloaded"))
      .mockResolvedValueOnce({ data: "ok" })
    const config = makeConfig({ "claude/opus": "claude/sonnet" })
    const result = await withResilience(fn, "claude", "opus", config)
    expect(result.fallback!.reason).toContain("503 overloaded")
  })
})
