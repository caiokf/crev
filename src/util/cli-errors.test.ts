import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { errorMessage, readFileOrDie } from "./cli-errors.js"

describe("errorMessage", () => {
  it("returns the .message of an Error", () => {
    expect(errorMessage(new Error("boom"))).toBe("boom")
  })

  it("stringifies non-Error values", () => {
    expect(errorMessage("string error")).toBe("string error")
    expect(errorMessage(42)).toBe("42")
    expect(errorMessage(null)).toBe("null")
    expect(errorMessage(undefined)).toBe("undefined")
    expect(errorMessage({ foo: "bar" })).toBe("[object Object]")
  })

  it("keeps subclasses of Error working", () => {
    class MyErr extends Error {}
    expect(errorMessage(new MyErr("custom"))).toBe("custom")
  })
})

describe("readFileOrDie", () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "crev-cli-err-"))
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it("reads and returns file content when it exists", () => {
    const file = path.join(tmpDir, "x.txt")
    fs.writeFileSync(file, "hello world", "utf-8")
    expect(readFileOrDie(file)).toBe("hello world")
  })

  it("calls process.exit(1) with an error message when the file is missing", () => {
    const missing = path.join(tmpDir, "does-not-exist.txt")
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(((code?: number) => {
      throw new Error(`exit:${code}`)
    }) as never)
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {})

    expect(() => readFileOrDie(missing, "Config")).toThrow("exit:1")
    expect(errSpy).toHaveBeenCalledWith(expect.stringContaining("Config not found"))
    expect(errSpy.mock.calls[0][0]).toContain(missing)

    exitSpy.mockRestore()
    errSpy.mockRestore()
  })
})
