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

// ── Config ──

export class ConfigParseError extends Data.TaggedError("ConfigParseError")<{
  readonly path: string
  readonly cause: unknown
}> {}

export class CrevDirNotFoundError extends Data.TaggedError("CrevDirNotFoundError")<{
  readonly searched: string
}> {}

// ── Schema ──

export class SchemaNotFoundError extends Data.TaggedError("SchemaNotFoundError")<{
  readonly name: string
  readonly searched: readonly string[]
}> {}

export class SchemaInvalidError extends Data.TaggedError("SchemaInvalidError")<{
  readonly path: string
  readonly reason: string
}> {}

// ── Reviews ──

export class ReviewParseError extends Data.TaggedError("ReviewParseError")<{
  readonly path: string
  readonly cause: unknown
}> {}

export class ReviewNotFoundError extends Data.TaggedError("ReviewNotFoundError")<{
  readonly outputDir: string
}> {}

export class IssueNotFoundError extends Data.TaggedError("IssueNotFoundError")<{
  readonly filePath: string
  readonly issueId: string
}> {}

// ── Diff ──

export class DiffResolutionError extends Data.TaggedError("DiffResolutionError")<{
  readonly reason: string
  readonly cause: unknown
}> {}

// ── Run ──

export class RunValidationError extends Data.TaggedError("RunValidationError")<{
  readonly reason: string
}> {}

export class RunCancelledError extends Data.TaggedError("RunCancelledError")<{
  readonly message?: string
}> {}

export class OrchestrationError extends Data.TaggedError("OrchestrationError")<{
  readonly reason: string
  readonly cause: unknown
}> {}

// ── Git ──

export class GitError extends Data.TaggedError("GitError")<{
  readonly command: string
  readonly reason: string
  readonly cause: unknown
}> {}

// ── Runtime execution ──

export class RuntimeExecError extends Data.TaggedError("RuntimeExecError")<{
  readonly runtime: string
  readonly reason: string
  readonly cause: unknown
}> {}

export class RuntimeNotFoundError extends Data.TaggedError("RuntimeNotFoundError")<{
  readonly runtime: string
}> {}
