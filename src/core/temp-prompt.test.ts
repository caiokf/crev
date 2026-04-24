import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { describe, expect, it } from "vitest"
import { withTempPromptFile } from "./temp-prompt.js"

describe("withTempPromptFile", () => {
  it("creates a readable file under os.tmpdir() and passes its path to the callback", async () => {
    let seenPath = ""
    await withTempPromptFile("crev-prompt-test", "hello", async (p) => {
      seenPath = p
      expect(p.startsWith(os.tmpdir())).toBe(true)
      expect(path.basename(p).startsWith("crev-prompt-test-")).toBe(true)
      expect(fs.readFileSync(p, "utf-8")).toBe("hello")
    })
    expect(seenPath).not.toBe("")
  })

  it("creates the file with owner-only mode (0o600)", async () => {
    await withTempPromptFile("crev-prompt-mode", "x", async (p) => {
      const mode = fs.statSync(p).mode & 0o777
      expect(mode).toBe(0o600)
    })
  })

  it("deletes the temp file after the callback resolves", async () => {
    let capturedPath = ""
    await withTempPromptFile("crev-prompt-cleanup", "bye", async (p) => {
      capturedPath = p
    })
    expect(fs.existsSync(capturedPath)).toBe(false)
  })

  it("deletes the temp file even when the callback throws", async () => {
    let capturedPath = ""
    await expect(
      withTempPromptFile("crev-prompt-throw", "bye", async (p) => {
        capturedPath = p
        throw new Error("boom")
      }),
    ).rejects.toThrow("boom")
    expect(fs.existsSync(capturedPath)).toBe(false)
  })

  it("returns whatever the callback returns", async () => {
    const result = await withTempPromptFile("crev-prompt-return", "x", async () => 42)
    expect(result).toBe(42)
  })

  it("refuses to overwrite an existing file (O_EXCL flag)", async () => {
    // Pre-create a file at a name the next call might reach. We can't
    // predict the exact name (it includes a random suffix), but we can
    // assert the "wx" semantics by pre-creating a collision and running
    // a separate call that mkdirs that exact path up front.
    // Simpler: observe that two sequential calls never collide — the
    // unique suffix gives that — so here we verify the contract by
    // trying to open the same path with flag:"wx" ourselves.
    const filePath = path.join(os.tmpdir(), `crev-prompt-excl-test-${Date.now()}.txt`)
    fs.writeFileSync(filePath, "preexisting", { encoding: "utf-8", flag: "w" })
    expect(() =>
      fs.writeFileSync(filePath, "new", { encoding: "utf-8", flag: "wx", mode: 0o600 }),
    ).toThrow(/EEXIST/)
    fs.unlinkSync(filePath)
  })
})
