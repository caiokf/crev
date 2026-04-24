import { Context, Effect, Layer } from "effect"
import { checkbox as inquirerCheckbox, confirm as inquirerConfirm } from "@inquirer/prompts"

export type CheckboxChoice<T> = {
  readonly name: string
  readonly value: T
  readonly checked?: boolean
  readonly disabled?: boolean | string
}

export type CheckboxInput<T> = {
  readonly message: string
  readonly choices: ReadonlyArray<CheckboxChoice<T>>
}

export type ConfirmInput = {
  readonly message: string
  readonly default?: boolean
}

export interface PrompterService {
  /**
   * Multi-select prompt. Returns the values the user ticked.
   * Pre-checked defaults come from `choices[].checked`.
   */
  readonly checkbox: <T>(input: CheckboxInput<T>) => Effect.Effect<T[]>

  /** Yes/no prompt with optional default. */
  readonly confirm: (input: ConfirmInput) => Effect.Effect<boolean>
}

export class Prompter extends Context.Tag("crev/Prompter")<
  Prompter,
  PrompterService
>() {}

/**
 * Live layer — delegates to `@inquirer/prompts`. Used by the CLI in
 * interactive mode. The TUI should provide its own `Layer` backed by
 * Ink components.
 */
export const PrompterLive = Layer.succeed(
  Prompter,
  Prompter.of({
    checkbox: <T>(input: CheckboxInput<T>) =>
      Effect.promise(() =>
        inquirerCheckbox({
          message: input.message,
          choices: input.choices.map((c) => ({
            name: c.name,
            value: c.value,
            checked: c.checked,
            disabled: c.disabled,
          })),
        }),
      ),

    confirm: (input) =>
      Effect.promise(() =>
        inquirerConfirm({ message: input.message, default: input.default }),
      ),
  }),
)

/**
 * Test layer — seed with a queue of answers. Each call to `checkbox`
 * or `confirm` dequeues the next response, letting tests drive the
 * interactive flow without spawning a TTY.
 */
export type PrompterScript = ReadonlyArray<
  { readonly kind: "checkbox"; readonly values: unknown[] } | { readonly kind: "confirm"; readonly value: boolean }
>

export const makeTestPrompter = (
  script: PrompterScript,
): { layer: Layer.Layer<Prompter>; remaining: () => number } => {
  const queue = [...script]
  const next = () => {
    const answer = queue.shift()
    if (!answer) throw new Error("Prompter script exhausted — test asked for more input than provided")
    return answer
  }

  const layer = Layer.succeed(
    Prompter,
    Prompter.of({
      checkbox: <T>(_input: CheckboxInput<T>) =>
        Effect.sync(() => {
          const answer = next()
          if (answer.kind !== "checkbox") {
            throw new Error(`Prompter script mismatch: expected checkbox, got ${answer.kind}`)
          }
          return answer.values as T[]
        }),

      confirm: (_input) =>
        Effect.sync(() => {
          const answer = next()
          if (answer.kind !== "confirm") {
            throw new Error(`Prompter script mismatch: expected confirm, got ${answer.kind}`)
          }
          return answer.value
        }),
    }),
  )
  return { layer, remaining: () => queue.length }
}
