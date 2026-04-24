import { describe, expect } from "vitest"
import { it } from "@effect/vitest"
import { Effect, Exit } from "effect"
import path from "node:path"
import { FileSystem, FileSystemLive, makeTestFileSystem } from "./FileSystem.js"
import { FileNotFoundError, FileReadError } from "../errors.js"

describe("FileSystem service — in-memory test layer", () => {
  it.effect("readFile returns seeded contents", () => {
    const { layer } = makeTestFileSystem({
      "/proj/config.yaml": "defaults:\n  schema: quick\n",
    })
    return Effect.gen(function* () {
      const fs = yield* FileSystem
      const content = yield* fs.readFile("/proj/config.yaml")
      expect(content).toBe("defaults:\n  schema: quick\n")
    }).pipe(Effect.provide(layer))
  })

  it.effect("readFile fails with FileNotFoundError for missing path", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem
      const exit = yield* Effect.exit(fs.readFile("/missing"))
      expect(Exit.isFailure(exit)).toBe(true)
      if (Exit.isFailure(exit)) {
        const err = exit.cause._tag === "Fail" ? exit.cause.error : null
        expect(err?._tag).toBe("FileNotFoundError")
      }
    }).pipe(Effect.provide(makeTestFileSystem({}).layer)),
  )

  it.effect("writeFile + readFile roundtrip", () => {
    const { layer, files } = makeTestFileSystem({})
    return Effect.gen(function* () {
      const fs = yield* FileSystem
      yield* fs.writeFile("/out/a.json", "{\"ok\":true}")
      const content = yield* fs.readFile("/out/a.json")
      expect(content).toBe("{\"ok\":true}")
      expect(files.get("/out/a.json")).toBe("{\"ok\":true}")
    }).pipe(Effect.provide(layer))
  })

  it.effect("exists reflects seeded + written files", () => {
    const { layer } = makeTestFileSystem({ "/a": "x" })
    return Effect.gen(function* () {
      const fs = yield* FileSystem
      expect(yield* fs.exists("/a")).toBe(true)
      expect(yield* fs.exists("/b")).toBe(false)
      yield* fs.writeFile("/b", "y")
      expect(yield* fs.exists("/b")).toBe(true)
    }).pipe(Effect.provide(layer))
  })

  it.effect("readDir lists immediate entries by path prefix", () => {
    const { layer } = makeTestFileSystem({
      "/reviews/a.json": "{}",
      "/reviews/b.json": "{}",
      "/reviews/nested/c.json": "{}",
      "/other/d.json": "{}",
    })
    return Effect.gen(function* () {
      const fs = yield* FileSystem
      const entries = yield* fs.readDir("/reviews")
      expect(entries.sort()).toEqual(["a.json", "b.json", "nested"])
    }).pipe(Effect.provide(layer))
  })

  it.effect("mkdir is a no-op in the in-memory layer but still succeeds", () => {
    const { layer } = makeTestFileSystem({})
    return Effect.gen(function* () {
      const fs = yield* FileSystem
      yield* fs.mkdir("/new/dir")
      // no assertion — writeFile following should work
      yield* fs.writeFile("/new/dir/file", "ok")
      expect(yield* fs.readFile("/new/dir/file")).toBe("ok")
    }).pipe(Effect.provide(layer))
  })
})

describe("FileSystem service — Live layer", () => {
  it.effect("readFile succeeds on a real file", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem
      // Use our own package.json — guaranteed to exist.
      const pkg = yield* fs.readFile(path.resolve("package.json"))
      expect(pkg).toContain("\"name\": \"@caiokf/crev\"")
    }).pipe(Effect.provide(FileSystemLive)),
  )

  it.effect("readFile on a missing path returns FileNotFoundError", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem
      const exit = yield* Effect.exit(fs.readFile("/definitely/does/not/exist.xyz"))
      expect(Exit.isFailure(exit)).toBe(true)
      if (Exit.isFailure(exit)) {
        const err = exit.cause._tag === "Fail" ? exit.cause.error : null
        expect(err?._tag).toBe("FileNotFoundError")
      }
    }).pipe(Effect.provide(FileSystemLive)),
  )
})

// Silence "unused import" noise if the ADTs aren't referenced in every block.
void FileReadError
