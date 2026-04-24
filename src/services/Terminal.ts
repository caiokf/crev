import { Context, Effect, Layer } from "effect"

export interface TerminalService {
  /** Write to stdout with a trailing newline. */
  readonly println: (text: string) => Effect.Effect<void>
  /** Write to stdout without a trailing newline. */
  readonly print: (text: string) => Effect.Effect<void>
  /** Write to stderr with a trailing newline. */
  readonly errln: (text: string) => Effect.Effect<void>
}

export class Terminal extends Context.Tag("crev/Terminal")<Terminal, TerminalService>() {}

/**
 * CLI terminal — writes to the real process streams.
 */
export const TerminalCli = Layer.succeed(
  Terminal,
  Terminal.of({
    println: (text) => Effect.sync(() => process.stdout.write(`${text}\n`)),
    print: (text) => Effect.sync(() => process.stdout.write(text)),
    errln: (text) => Effect.sync(() => process.stderr.write(`${text}\n`)),
  }),
)

/**
 * Silent terminal — drops all output. Used by the TUI, which renders
 * through blessed rather than raw stdout/stderr.
 */
export const TerminalSilent = Layer.succeed(
  Terminal,
  Terminal.of({
    println: () => Effect.void,
    print: () => Effect.void,
    errln: () => Effect.void,
  }),
)

/**
 * Test terminal — captures writes in arrays that specs can assert on.
 * Each entry preserves the exact string written, including any trailing
 * newline appended by `println`/`errln`.
 */
export const makeTestTerminal = (): {
  layer: Layer.Layer<Terminal>
  stdout: string[]
  stderr: string[]
} => {
  const stdout: string[] = []
  const stderr: string[] = []
  const layer = Layer.succeed(
    Terminal,
    Terminal.of({
      println: (text) =>
        Effect.sync(() => {
          stdout.push(`${text}\n`)
        }),
      print: (text) =>
        Effect.sync(() => {
          stdout.push(text)
        }),
      errln: (text) =>
        Effect.sync(() => {
          stderr.push(`${text}\n`)
        }),
    }),
  )
  return { layer, stdout, stderr }
}
