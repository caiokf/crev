import { Context, Effect, Layer } from "effect"
import * as nodeFs from "node:fs/promises"
import path from "node:path"
import { DirReadError, FileNotFoundError, FileReadError, FileWriteError } from "../errors.js"

export interface FileSystemService {
  readonly readFile: (
    filePath: string,
  ) => Effect.Effect<string, FileNotFoundError | FileReadError>
  readonly writeFile: (
    filePath: string,
    content: string,
  ) => Effect.Effect<void, FileWriteError>
  readonly exists: (filePath: string) => Effect.Effect<boolean>
  readonly mkdir: (dirPath: string) => Effect.Effect<void, FileWriteError>
  readonly readDir: (
    dirPath: string,
  ) => Effect.Effect<string[], FileNotFoundError | DirReadError>
}

export class FileSystem extends Context.Tag("crev/FileSystem")<
  FileSystem,
  FileSystemService
>() {}

/** Node.js-backed implementation. */
export const FileSystemLive = Layer.succeed(
  FileSystem,
  FileSystem.of({
    readFile: (filePath) =>
      Effect.tryPromise({
        try: () => nodeFs.readFile(filePath, "utf-8"),
        catch: (cause) => {
          if (isEnoent(cause)) return new FileNotFoundError({ path: filePath })
          return new FileReadError({ path: filePath, cause })
        },
      }),

    writeFile: (filePath, content) =>
      Effect.tryPromise({
        try: async () => {
          await nodeFs.mkdir(path.dirname(filePath), { recursive: true })
          await nodeFs.writeFile(filePath, content, "utf-8")
        },
        catch: (cause) => new FileWriteError({ path: filePath, cause }),
      }),

    exists: (filePath) =>
      Effect.tryPromise({
        try: () => nodeFs.access(filePath).then(() => true),
        catch: () => undefined,
      }).pipe(
        Effect.catchAll(() => Effect.succeed(false)),
        Effect.map((v): boolean => v === true),
      ),

    mkdir: (dirPath) =>
      Effect.tryPromise({
        try: () => nodeFs.mkdir(dirPath, { recursive: true }).then(() => undefined),
        catch: (cause) => new FileWriteError({ path: dirPath, cause }),
      }),

    readDir: (dirPath) =>
      Effect.tryPromise({
        try: () => nodeFs.readdir(dirPath),
        catch: (cause) => {
          if (isEnoent(cause)) return new FileNotFoundError({ path: dirPath })
          return new DirReadError({ path: dirPath, cause })
        },
      }),
  }),
)

/**
 * In-memory test layer. Seed with a map of absolute path → contents.
 * The returned `files` Map is the live backing store so specs can
 * inspect writes or mutate it between assertions.
 */
export const makeTestFileSystem = (
  seed: Record<string, string>,
): { layer: Layer.Layer<FileSystem>; files: Map<string, string> } => {
  const files = new Map<string, string>(Object.entries(seed))

  const layer = Layer.succeed(
    FileSystem,
    FileSystem.of({
      readFile: (filePath) =>
        files.has(filePath)
          ? Effect.succeed(files.get(filePath) as string)
          : Effect.fail(new FileNotFoundError({ path: filePath })),

      writeFile: (filePath, content) =>
        Effect.sync(() => {
          files.set(filePath, content)
        }),

      exists: (filePath) =>
        Effect.sync(() => {
          if (files.has(filePath)) return true
          // Treat a path as existing if any seeded file lives under it (directory).
          const prefix = filePath.endsWith("/") ? filePath : `${filePath}/`
          for (const k of files.keys()) if (k.startsWith(prefix)) return true
          return false
        }),

      mkdir: () => Effect.void,

      readDir: (dirPath) => {
        const prefix = dirPath.endsWith("/") ? dirPath : `${dirPath}/`
        const entries = new Set<string>()
        let found = false
        for (const key of files.keys()) {
          if (!key.startsWith(prefix)) continue
          found = true
          const rest = key.slice(prefix.length)
          const slash = rest.indexOf("/")
          entries.add(slash === -1 ? rest : rest.slice(0, slash))
        }
        if (!found) return Effect.fail(new FileNotFoundError({ path: dirPath }))
        return Effect.succeed([...entries])
      },
    }),
  )

  return { layer, files }
}

function isEnoent(cause: unknown): boolean {
  return (
    typeof cause === "object" &&
    cause !== null &&
    "code" in cause &&
    (cause as { code: unknown }).code === "ENOENT"
  )
}
