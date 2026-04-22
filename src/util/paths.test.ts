import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { findProjectRoot, uniqueSuffix } from "./paths.js"

describe("findProjectRoot", () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "crev-test-"))
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it("directory with .crev returns that directory", () => {
    fs.mkdirSync(path.join(tmpDir, ".crev"))
    expect(findProjectRoot(tmpDir)).toBe(tmpDir)
  })

  it("directory with only .git returns that directory", () => {
    fs.mkdirSync(path.join(tmpDir, ".git"))
    expect(findProjectRoot(tmpDir)).toBe(tmpDir)
  })

  it(".crev in parent wins when starting from child", () => {
    fs.mkdirSync(path.join(tmpDir, ".crev"))
    const childDir = path.join(tmpDir, "packages", "cli")
    fs.mkdirSync(childDir, { recursive: true })
    expect(findProjectRoot(childDir)).toBe(tmpDir)
  })

  it("neither .crev nor .git returns startDir as fallback", () => {
    const emptyDir = path.join(tmpDir, "empty")
    fs.mkdirSync(emptyDir)
    expect(findProjectRoot(emptyDir)).toBe(emptyDir)
  })
})

describe("uniqueSuffix", () => {
  it("returns a 6-character hex string", () => {
    const suffix = uniqueSuffix()
    expect(suffix).toMatch(/^[0-9a-f]{6}$/)
  })

  it("generates different values on consecutive calls", () => {
    const suffixes = new Set(Array.from({ length: 20 }, () => uniqueSuffix()))
    expect(suffixes.size).toBe(20)
  })
})
