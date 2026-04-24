import { Context, Effect, Layer } from "effect"
import path from "node:path"
import { FileSystem } from "./FileSystem.js"
import { renderMarkdown } from "../core/output.js"
import { ReviewNotFoundError, ReviewParseError } from "../errors.js"
import type { FileNotFoundError, FileReadError, FileWriteError } from "../errors.js"
import type { ReviewResult } from "../core/types.js"

export type OutputFormat = "json" | "markdown" | "both"

export type WriteInput = {
  readonly result: ReviewResult
  readonly outputDir: string
  readonly slug: string
  readonly format: OutputFormat
  /** Injectable for deterministic tests; defaults to the current time. */
  readonly timestamp?: Date
  /** Injectable unique suffix; defaults to a random 6-char hex. */
  readonly suffix?: string
}

export type OutputPaths = {
  readonly jsonPath: string
  readonly markdownPath?: string
}

export type ReviewList = {
  readonly reviews: ReviewResult[]
  readonly skipped: string[]
}

export interface ReviewStoreService {
  readonly list: (outputDir: string) => Effect.Effect<ReviewList>

  readonly load: (
    filePath: string,
  ) => Effect.Effect<ReviewResult, FileNotFoundError | FileReadError | ReviewParseError>

  readonly latest: (
    outputDir: string,
  ) => Effect.Effect<ReviewResult, ReviewNotFoundError | ReviewParseError | FileReadError>

  readonly write: (input: WriteInput) => Effect.Effect<OutputPaths, FileWriteError>
}

export class ReviewStore extends Context.Tag("crev/ReviewStore")<
  ReviewStore,
  ReviewStoreService
>() {}

/** FileSystem-backed live layer. */
export const ReviewStoreLive = Layer.effect(
  ReviewStore,
  Effect.gen(function* () {
    const fs = yield* FileSystem

    const list: ReviewStoreService["list"] = (outputDir) =>
      Effect.gen(function* () {
        const entries = yield* fs.readDir(outputDir).pipe(
          Effect.catchAll(() => Effect.succeed([] as string[])),
        )
        const jsonFiles = entries.filter((f) => f.endsWith(".json")).sort()

        const reviews: ReviewResult[] = []
        const skipped: string[] = []

        for (const entry of jsonFiles) {
          const filePath = path.join(outputDir, entry)
          const parsed = yield* parseReviewFile(fs, filePath).pipe(
            Effect.catchAll(() => Effect.succeed(null)),
          )
          if (parsed) reviews.push(parsed)
          else skipped.push(filePath)
        }

        return { reviews, skipped }
      })

    const load: ReviewStoreService["load"] = (filePath) =>
      parseReviewFile(fs, filePath)

    const latest: ReviewStoreService["latest"] = (outputDir) =>
      Effect.gen(function* () {
        const { reviews } = yield* list(outputDir)
        if (reviews.length === 0) {
          return yield* Effect.fail(new ReviewNotFoundError({ outputDir }))
        }
        return reviews.slice().sort((a, b) =>
          a.metadata.timestamp.localeCompare(b.metadata.timestamp),
        )[reviews.length - 1]
      })

    const write: ReviewStoreService["write"] = (input) =>
      Effect.gen(function* () {
        const timestamp = input.timestamp ?? new Date()
        const suffix = input.suffix ?? randomSuffix()
        const basename = buildBasename(input.slug, timestamp, suffix)

        const jsonPath = path.join(input.outputDir, `${basename}.json`)
        yield* fs.writeFile(jsonPath, JSON.stringify(input.result, null, 2))

        if (input.format === "markdown" || input.format === "both") {
          const mdPath = path.join(input.outputDir, `${basename}.md`)
          yield* fs.writeFile(mdPath, renderMarkdown(input.result))
          return { jsonPath, markdownPath: mdPath }
        }

        return { jsonPath }
      })

    return ReviewStore.of({ list, load, latest, write })
  }),
)

/**
 * Test layer — seed with a map of filePath → ReviewResult. Writes are
 * captured into the same map so specs can assert on what landed where.
 */
export const makeTestReviewStore = (
  seed: Record<string, ReviewResult>,
): {
  layer: Layer.Layer<ReviewStore>
  files: Map<string, ReviewResult>
} => {
  const files = new Map<string, ReviewResult>(Object.entries(seed))

  const layer = Layer.succeed(
    ReviewStore,
    ReviewStore.of({
      list: (outputDir) =>
        Effect.sync(() => {
          const prefix = outputDir.endsWith("/") ? outputDir : `${outputDir}/`
          const matched = [...files.entries()]
            .filter(([p]) => p.startsWith(prefix) && p.endsWith(".json"))
            .map(([, v]) => v)
            .sort((a, b) => a.metadata.timestamp.localeCompare(b.metadata.timestamp))
          return { reviews: matched, skipped: [] }
        }),

      load: (filePath) =>
        files.has(filePath)
          ? Effect.succeed(files.get(filePath) as ReviewResult)
          : Effect.fail(
              new ReviewParseError({
                path: filePath,
                cause: new Error("not found in test store"),
              }),
            ),

      latest: (outputDir) =>
        Effect.sync(() => {
          const prefix = outputDir.endsWith("/") ? outputDir : `${outputDir}/`
          const matched = [...files.entries()]
            .filter(([p]) => p.startsWith(prefix) && p.endsWith(".json"))
            .map(([, v]) => v)
            .sort((a, b) => a.metadata.timestamp.localeCompare(b.metadata.timestamp))
          return matched
        }).pipe(
          Effect.flatMap((matched) =>
            matched.length === 0
              ? Effect.fail(new ReviewNotFoundError({ outputDir }))
              : Effect.succeed(matched[matched.length - 1]),
          ),
        ),

      write: (input) =>
        Effect.sync(() => {
          const timestamp = input.timestamp ?? new Date()
          const suffix = input.suffix ?? "test00"
          const basename = buildBasename(input.slug, timestamp, suffix)
          const jsonPath = path.join(input.outputDir, `${basename}.json`)
          files.set(jsonPath, input.result)
          if (input.format === "markdown" || input.format === "both") {
            const mdPath = path.join(input.outputDir, `${basename}.md`)
            files.set(mdPath, input.result)
            return { jsonPath, markdownPath: mdPath }
          }
          return { jsonPath }
        }),
    }),
  )

  return { layer, files }
}

// ── helpers ──

const parseReviewFile = (
  fs: FileSystem["Type"],
  filePath: string,
): Effect.Effect<ReviewResult, FileNotFoundError | FileReadError | ReviewParseError> =>
  Effect.gen(function* () {
    const raw = yield* fs.readFile(filePath)
    const parsed = yield* Effect.try({
      try: () => JSON.parse(raw) as ReviewResult,
      catch: (cause) => new ReviewParseError({ path: filePath, cause }),
    })
    if (!parsed || !Array.isArray((parsed as { reviews?: unknown }).reviews)) {
      return yield* Effect.fail(
        new ReviewParseError({
          path: filePath,
          cause: new Error("missing reviews array"),
        }),
      )
    }
    return parsed
  })

function buildBasename(slug: string, date: Date, suffix: string): string {
  const y = date.getFullYear()
  const mo = String(date.getMonth() + 1).padStart(2, "0")
  const d = String(date.getDate()).padStart(2, "0")
  const hh = String(date.getHours()).padStart(2, "0")
  const mm = String(date.getMinutes()).padStart(2, "0")
  return `${y}-${mo}-${d}-${hh}${mm}-${slug}-${suffix}`
}

function randomSuffix(): string {
  return Array.from({ length: 6 }, () =>
    Math.floor(Math.random() * 16).toString(16),
  ).join("")
}
