import { Context, Effect, Layer } from "effect"
import chalk from "chalk"

export type LogLevel = "info" | "warn" | "error" | "debug"

export type LogEntry = { level: LogLevel; msg: string }

export interface LoggerService {
  readonly info: (msg: string) => Effect.Effect<void>
  readonly warn: (msg: string) => Effect.Effect<void>
  readonly error: (msg: string) => Effect.Effect<void>
  readonly debug: (msg: string) => Effect.Effect<void>
}

export class Logger extends Context.Tag("crev/Logger")<Logger, LoggerService>() {}

/**
 * CLI logger — writes to stderr with chalk-colored level prefixes.
 * stderr keeps stdout reserved for structured output (JSON, etc.).
 */
export const LoggerCli = Layer.succeed(
  Logger,
  Logger.of({
    info: (msg) => Effect.sync(() => console.error(chalk.cyan(msg))),
    warn: (msg) => Effect.sync(() => console.error(chalk.yellow(msg))),
    error: (msg) => Effect.sync(() => console.error(chalk.red(msg))),
    debug: (msg) =>
      Effect.sync(() => {
        if (process.env.CREV_DEBUG) console.error(chalk.dim(msg))
      }),
  }),
)

/**
 * Silent logger — drops everything. Used by TUI (which owns its own
 * rendering) and any headless context where logs should not leak.
 */
export const LoggerSilent = Layer.succeed(
  Logger,
  Logger.of({
    info: () => Effect.void,
    warn: () => Effect.void,
    error: () => Effect.void,
    debug: () => Effect.void,
  }),
)

/**
 * Test logger — appends to a captured array so specs can assert on the
 * sequence and level of messages produced by an action.
 */
export const makeTestLogger = (): { layer: Layer.Layer<Logger>; messages: LogEntry[] } => {
  const messages: LogEntry[] = []
  const push = (level: LogLevel) => (msg: string) =>
    Effect.sync(() => {
      messages.push({ level, msg })
    })
  const layer = Layer.succeed(
    Logger,
    Logger.of({
      info: push("info"),
      warn: push("warn"),
      error: push("error"),
      debug: push("debug"),
    }),
  )
  return { layer, messages }
}
