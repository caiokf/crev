import { Data } from "effect"

/**
 * Tagged error ADT for crev.
 *
 * Each error is a `Data.TaggedError` — pattern-matchable via `_tag`,
 * exhaustively checkable in CLI/TUI error mappers.
 *
 * Only foundational errors live here. Action-specific errors (e.g.
 * `SchemaNotFoundError`, `ReviewerTimeoutError`) are declared next to
 * the actions/services that produce them.
 */

export class FileNotFoundError extends Data.TaggedError("FileNotFoundError")<{
  readonly path: string
}> {}

export class FileReadError extends Data.TaggedError("FileReadError")<{
  readonly path: string
  readonly cause: unknown
}> {}

export class FileWriteError extends Data.TaggedError("FileWriteError")<{
  readonly path: string
  readonly cause: unknown
}> {}

export class DirReadError extends Data.TaggedError("DirReadError")<{
  readonly path: string
  readonly cause: unknown
}> {}
