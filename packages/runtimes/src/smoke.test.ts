/**
 * Smoke tests — run against real installed runtimes.
 *
 * Skipped by default. Run with:
 *   SMOKE=1 pnpm vitest run packages/runtimes/src/smoke.test.ts
 *
 * These tests verify that:
 * 1. healthCheck() returns valid data against real CLIs
 * 2. A trivial prompt produces output (for installed + authenticated runtimes)
 */
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { describe, expect, it } from "vitest"
import { getAllRuntimes } from "./registry.js"
import type { RuntimeAdapter, RuntimeHealth } from "./types.js"

const SMOKE = process.env.SMOKE === "1"
const describeSmoke = SMOKE ? describe : describe.skip

// Cache health results so we don't call healthCheck() multiple times per runtime
const healthCache = new Map<string, RuntimeHealth>()

async function getHealth(runtime: RuntimeAdapter): Promise<RuntimeHealth> {
  if (!healthCache.has(runtime.name)) {
    healthCache.set(runtime.name, await runtime.healthCheck())
  }
  return healthCache.get(runtime.name)!
}

describeSmoke("smoke tests (real runtimes)", () => {
  const runtimes = getAllRuntimes()

  describe("healthCheck against real system", () => {
    for (const runtime of runtimes) {
      it(`${runtime.name}: healthCheck returns valid structure`, async () => {
        const health = await getHealth(runtime)

        // Structure checks
        expect(health.name).toBe(runtime.name)
        expect(health.command).toBeTruthy()
        expect(typeof health.installed).toBe("boolean")
        expect(["yes", "no", "unknown"]).toContain(health.authenticated)
        expect(typeof health.authDetail).toBe("string")

        // If installed, version should be a string or null (TUI-only tools)
        if (health.installed) {
          expect(health.version === null || typeof health.version === "string").toBe(true)
        }
      }, 10_000)
    }
  })

  describe("preflight against real system", () => {
    for (const runtime of runtimes) {
      it(`${runtime.name}: preflight with default model`, async () => {
        const result = await runtime.preflight({ model: runtime.defaultModel })

        // Structure checks
        expect(typeof result.ok).toBe("boolean")
        expect(Array.isArray(result.issues)).toBe(true)

        if (result.ok) {
          expect(result.issues).toHaveLength(0)
        }
      }, 10_000)

      it(`${runtime.name}: preflight with bogus model reports issue`, async () => {
        const result = await runtime.preflight({ model: "nonexistent-model-xyz" })
        expect(result.issues.some((i) => i.includes("nonexistent-model-xyz"))).toBe(true)
      }, 10_000)
    }
  })

  describe("trivial prompt execution", () => {
    for (const runtime of runtimes) {
      // Only test runtimes that are installed and authenticated
      it(`${runtime.name}: execute trivial prompt (if available)`, async () => {
        const health = await getHealth(runtime)

        if (!health.installed) {
          console.log(`  [skip] ${runtime.name}: not installed`)
          return
        }

        if (health.authenticated !== "yes") {
          console.log(`  [skip] ${runtime.name}: not authenticated (${health.authenticated})`)
          return
        }

        if (!runtime.supportsCustomPrompt) {
          console.log(`  [skip] ${runtime.name}: does not support custom prompts`)
          return
        }

        // Write a trivial prompt to a temp file
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "crev-smoke-"))
        const promptFile = path.join(tmpDir, "prompt.txt")
        fs.writeFileSync(promptFile, "Reply with exactly: SMOKE_TEST_OK")

        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), 60_000)

        try {
          const result = await runtime.execute({
            taskName: "smoke-test",
            model: runtime.defaultModel,
            prompt: "Reply with exactly: SMOKE_TEST_OK",
            promptFile,
            signal: controller.signal,
          })

          // We don't assert the exact content — just that we got output
          expect(typeof result.raw).toBe("string")
          expect(result.raw.length).toBeGreaterThan(0)
          expect(typeof result.exitCode).toBe("number")
          expect(typeof result.durationMs).toBe("number")

          console.log(`  [pass] ${runtime.name}: ${result.raw.length} chars in ${(result.durationMs / 1000).toFixed(1)}s (exit ${result.exitCode})`)
        } finally {
          clearTimeout(timeout)
          fs.rmSync(tmpDir, { recursive: true, force: true })
        }
      }, 120_000) // 2 minute timeout per runtime
    }
  })
})
