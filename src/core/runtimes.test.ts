import { describe, expect, it, vi } from "vitest"
import type { RuntimeAdapter, RuntimeHealth } from "@caiokf/valet"
import {
  collectRuntimeHealthParallel,
  sanitizeRuntimeHealth,
  selectRuntimesToCheck,
} from "./runtimes.js"

describe("selectRuntimesToCheck", () => {
  const all = [{ name: "claude" }, { name: "gemini" }, { name: "codex" }]

  it("returns every runtime when includeAll is true", () => {
    expect(selectRuntimesToCheck(all, new Set(["claude"]), true)).toEqual(all)
  })

  it("filters to only referenced runtimes when includeAll is false", () => {
    expect(selectRuntimesToCheck(all, new Set(["claude", "codex"]), false)).toEqual([
      { name: "claude" },
      { name: "codex" },
    ])
  })

  it("returns an empty list when no runtimes are referenced and includeAll is false", () => {
    expect(selectRuntimesToCheck(all, new Set(), false)).toEqual([])
  })
})

describe("sanitizeRuntimeHealth", () => {
  const base: RuntimeHealth = {
    name: "claude",
    command: "claude",
    installed: true,
    version: null,
    authenticated: "yes",
    authDetail: "",
    error: null,
  }

  it("strips ANSI escape sequences from version, authDetail, and error", () => {
    const out = sanitizeRuntimeHealth({
      ...base,
      version: "\u001b[32mv1.2.3\u001b[0m",
      authDetail: "\u001b[31mbad\u001b[0m auth",
      error: "\u001b[1msomething broke\u001b[0m",
    })
    expect(out.version).toBe("v1.2.3")
    expect(out.authDetail).toBe("bad auth")
    expect(out.error).toBe("something broke")
  })

  it("strips OSC / bell sequences", () => {
    const out = sanitizeRuntimeHealth({
      ...base,
      version: "\u001b]0;title\u0007v9.9.9",
    })
    expect(out.version).toBe("v9.9.9")
  })

  it("replaces control characters with spaces and collapses runs of whitespace", () => {
    const out = sanitizeRuntimeHealth({
      ...base,
      version: "v1\u0000\u00001.2   spaced\tout",
    })
    expect(out.version).toBe("v1 1.2 spaced out")
  })

  it("caps sanitized output at 240 chars", () => {
    const long = "a".repeat(500)
    const out = sanitizeRuntimeHealth({ ...base, version: long })
    expect(out.version?.length).toBe(240)
  })

  it("returns null when sanitization strips everything from a nullable field", () => {
    const out = sanitizeRuntimeHealth({ ...base, version: "\u001b[0m\u0000" })
    expect(out.version).toBeNull()
  })

  it("falls back to empty string for authDetail (typed non-nullable) instead of leaking raw", () => {
    const raw = "\u001b[0m\u0000"
    const out = sanitizeRuntimeHealth({ ...base, authDetail: raw })
    expect(out.authDetail).toBe("")
    expect(out.authDetail).not.toBe(raw)
  })

  it("preserves non-string fields untouched", () => {
    const out = sanitizeRuntimeHealth({ ...base, version: "v1", installed: true, authenticated: "yes" })
    expect(out.installed).toBe(true)
    expect(out.authenticated).toBe("yes")
    expect(out.name).toBe("claude")
  })
})

describe("collectRuntimeHealthParallel", () => {
  function makeRuntime(name: string, health: Partial<RuntimeHealth> | Error): RuntimeAdapter {
    const rt = {
      name,
      healthCheck: vi.fn(),
    } as unknown as RuntimeAdapter
    if (health instanceof Error) {
      ;(rt.healthCheck as ReturnType<typeof vi.fn>).mockRejectedValue(health)
    } else {
      ;(rt.healthCheck as ReturnType<typeof vi.fn>).mockResolvedValue({
        name,
        command: name,
        installed: true,
        version: "1.0.0",
        authenticated: "yes",
        authDetail: "",
        error: null,
        ...health,
      })
    }
    return rt
  }

  it("returns sanitized healths in input order", async () => {
    const runtimes = [makeRuntime("a", {}), makeRuntime("b", {})]
    const results = await collectRuntimeHealthParallel(runtimes)
    expect(results.map((r) => r.name)).toEqual(["a", "b"])
  })

  it("converts thrown errors into synthetic unhealthy records without crashing", async () => {
    const runtimes = [
      makeRuntime("a", {}),
      makeRuntime("b", new Error("healthcheck died")),
    ]
    const results = await collectRuntimeHealthParallel(runtimes)
    expect(results[0].installed).toBe(true)
    expect(results[1].installed).toBe(false)
    expect(results[1].authenticated).toBe("unknown")
    expect(results[1].error).toContain("healthcheck died")
  })

  it("invokes onProgress for each runtime with cumulative and total counts", async () => {
    const runtimes = [makeRuntime("a", {}), makeRuntime("b", {}), makeRuntime("c", {})]
    const progress = vi.fn()
    await collectRuntimeHealthParallel(runtimes, progress)
    expect(progress).toHaveBeenCalledTimes(3)
    const totals = progress.mock.calls.map((c) => c[1])
    expect(totals).toEqual([3, 3, 3])
    const checkedValues = progress.mock.calls.map((c) => c[0]).sort()
    expect(checkedValues).toEqual([1, 2, 3])
  })
})
