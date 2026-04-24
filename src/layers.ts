import { Layer } from "effect"
import { CrevConfigLive } from "./services/CrevConfig.js"
import { FileSystemLive } from "./services/FileSystem.js"
import { LoggerCli, LoggerSilent } from "./services/Logger.js"
import { ReviewStoreLive } from "./services/ReviewStore.js"
import { SchemaStoreLive } from "./services/SchemaStore.js"
import { TerminalCli, TerminalSilent } from "./services/Terminal.js"

/**
 * Production layer for the CLI. Logger writes to stderr (with colors),
 * Terminal writes to stdout/stderr directly.
 *
 * Consumers of `CliLive` only need to list the services their action
 * requires in the Effect's R channel — provisioning pulls in everything
 * transitively.
 */
export const CliLive = Layer.mergeAll(
  LoggerCli,
  TerminalCli,
  FileSystemLive,
  CrevConfigLive,
  SchemaStoreLive,
  Layer.provide(ReviewStoreLive, FileSystemLive),
)

/**
 * Production layer for the TUI. Logger and Terminal are silenced so
 * that nothing leaks through blessed — the TUI owns the screen.
 */
export const TuiLive = Layer.mergeAll(
  LoggerSilent,
  TerminalSilent,
  FileSystemLive,
  CrevConfigLive,
  SchemaStoreLive,
  Layer.provide(ReviewStoreLive, FileSystemLive),
)
