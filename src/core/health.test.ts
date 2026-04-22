import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { checkProjectSetup, checkSchemaReadiness } from "./health.js"
import type { RuntimeHealth } from "@caiokf/valet"

describe("checkProjectSetup", () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "crev-health-"))
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it("reports missing config and schemas for empty .crev/", () => {
    fs.mkdirSync(tmpDir, { recursive: true })
    const checks = checkProjectSetup(tmpDir)
    expect(checks.find((c) => c.name === ".crev/config.yaml")?.ok).toBe(false)
    expect(checks.find((c) => c.name === "schemas")?.ok).toBe(false)
    expect(checks.find((c) => c.name === ".crev/reviews/")?.ok).toBe(false)
  })

  it("reports valid when config and schemas exist", () => {
    fs.mkdirSync(path.join(tmpDir, "schemas"), { recursive: true })
    fs.mkdirSync(path.join(tmpDir, "reviews"), { recursive: true })
    fs.writeFileSync(path.join(tmpDir, "config.yaml"), "defaults:\n  schema: quick\n")
    fs.writeFileSync(
      path.join(tmpDir, "schemas", "quick.yaml"),
      "reviewers:\n  - name: Eng\n    runtime: claude\n    model: sonnet\n",
    )

    const checks = checkProjectSetup(tmpDir)
    expect(checks.find((c) => c.name === ".crev/config.yaml")?.ok).toBe(true)
    expect(checks.find((c) => c.name === "schemas")?.ok).toBe(true)
    expect(checks.find((c) => c.name === "schemas")?.detail).toBe("1 schema")
    expect(checks.find((c) => c.name === ".crev/reviews/")?.ok).toBe(true)
  })

  it("pluralizes schema count", () => {
    fs.mkdirSync(path.join(tmpDir, "schemas"), { recursive: true })
    fs.writeFileSync(path.join(tmpDir, "config.yaml"), "defaults:\n  schema: quick\n")
    fs.writeFileSync(
      path.join(tmpDir, "schemas", "a.yaml"),
      "reviewers:\n  - name: E\n    runtime: claude\n    model: sonnet\n",
    )
    fs.writeFileSync(
      path.join(tmpDir, "schemas", "b.yaml"),
      "reviewers:\n  - name: E\n    runtime: claude\n    model: sonnet\n",
    )

    const checks = checkProjectSetup(tmpDir)
    expect(checks.find((c) => c.name === "schemas")?.detail).toBe("2 schemas")
  })
})

describe("checkSchemaReadiness", () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "crev-health-"))
    fs.mkdirSync(path.join(tmpDir, "schemas"), { recursive: true })
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  const makeHealth = (overrides: Partial<RuntimeHealth> = {}): RuntimeHealth => ({
    name: "claude",
    command: "claude",
    installed: true,
    version: "1.0",
    authenticated: "yes",
    authDetail: "",
    error: null,
    ...overrides,
  })

  it("marks schema ready when all runtimes are healthy", () => {
    fs.writeFileSync(
      path.join(tmpDir, "schemas", "quick.yaml"),
      "reviewers:\n  - name: Eng\n    runtime: claude\n    model: sonnet\n",
    )

    const results = checkSchemaReadiness(tmpDir, [makeHealth()])
    expect(results).toHaveLength(1)
    expect(results[0].ready).toBe(true)
    expect(results[0].issues).toHaveLength(0)
  })

  it("reports not ready when runtime is not installed", () => {
    fs.writeFileSync(
      path.join(tmpDir, "schemas", "quick.yaml"),
      "reviewers:\n  - name: Eng\n    runtime: claude\n    model: sonnet\n",
    )

    const results = checkSchemaReadiness(tmpDir, [makeHealth({ installed: false })])
    expect(results[0].ready).toBe(false)
    expect(results[0].issues[0]).toContain("not installed")
  })

  it("reports not ready when runtime is not authenticated", () => {
    fs.writeFileSync(
      path.join(tmpDir, "schemas", "quick.yaml"),
      "reviewers:\n  - name: Eng\n    runtime: claude\n    model: sonnet\n",
    )

    const results = checkSchemaReadiness(tmpDir, [makeHealth({ authenticated: "no" })])
    expect(results[0].ready).toBe(false)
    expect(results[0].issues[0]).toContain("not authenticated")
  })

  it("checks triage runtime too", () => {
    fs.writeFileSync(
      path.join(tmpDir, "schemas", "standard.yaml"),
      [
        "reviewers:",
        "  - name: Eng",
        "    runtime: claude",
        "    model: sonnet",
        "triage:",
        "  enabled: true",
        "  runtime: claude",
        "  model: opus",
      ].join("\n"),
    )

    const results = checkSchemaReadiness(tmpDir, [makeHealth({ authenticated: "no" })])
    expect(results[0].ready).toBe(false)
    // Should have issues for both reviewer and triage
    expect(results[0].issues.length).toBeGreaterThanOrEqual(2)
  })

  it("returns empty array when no schemas exist", () => {
    const results = checkSchemaReadiness(tmpDir, [makeHealth()])
    expect(results).toHaveLength(0)
  })
})
