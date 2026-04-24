import blessed from "blessed"
import { listSchemasAction, type SchemaSummary } from "../../actions/list.js"
import { runAction, type RunActionOutput } from "../../actions/run.js"
import type { DiffSource, RunCommand } from "../../core/types.js"
import { runDashEffect } from "../runtime.js"
import { BOX_STYLE, LIST_STYLE } from "../theme.js"
import type { AppContext, DashView } from "../types.js"

/**
 * Interactive wizard that walks the user through starting a review
 * from within the dash. Runs `runAction` with `{ kind: "dash" }`
 * output so the orchestrator stays silent and blessed owns the
 * screen. On success, navigates to the run-detail view.
 *
 * Scope for this PR: schema pick → diff pick → execute. Per-reviewer
 * progress requires ProgressBus wiring into the orchestrator and is
 * deferred to a follow-up.
 */

type WizardPhase =
  | { kind: "loading" }
  | { kind: "pick-schema"; schemas: SchemaSummary[] }
  | { kind: "pick-diff"; schema: string }
  | { kind: "running"; schema: string; diff: DiffSource; startedAt: number }
  | { kind: "error"; message: string }

type DiffChoice = {
  readonly label: string
  readonly build: (defaultBase: string) => DiffSource
}

export const DIFF_CHOICES: ReadonlyArray<DiffChoice> = [
  { label: "Uncommitted changes", build: () => ({ kind: "local", type: "uncommitted" }) },
  { label: "All local changes (committed + uncommitted)", build: () => ({ kind: "local", type: "all" }) },
  {
    label: "Branch vs base (from config defaults.base)",
    build: (base) => ({ kind: "branch", base, type: "all" }),
  },
]

export function createRunWizardView(): DashView {
  let phase: WizardPhase = { kind: "loading" }
  let root: blessed.Widgets.BoxElement | null = null
  let tickTimer: NodeJS.Timeout | null = null

  const destroyChildren = () => {
    if (root) {
      for (const child of [...root.children]) child.destroy()
    }
  }

  return {
    route: { kind: "run-wizard" },
    mount(ctx: AppContext) {
      root = blessed.box({
        parent: ctx.body,
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        label: " New review ",
        border: "line",
        style: BOX_STYLE,
      })

      const render = () => {
        if (!root) return
        destroyChildren()

        switch (phase.kind) {
          case "loading": {
            blessed.box({
              parent: root,
              top: "center",
              left: "center",
              width: "60%",
              height: 3,
              align: "center",
              content: "loading schemas…",
            })
            break
          }

          case "pick-schema": {
            const list = blessed.list({
              parent: root,
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              label: " Pick a schema ",
              border: "line",
              keys: true,
              mouse: true,
              tags: true,
              style: LIST_STYLE,
              items: phase.schemas.length
                ? phase.schemas.map((s) => `  ${s.name}  {gray-fg}${s.description || ""}{/gray-fg}`)
                : ["  (no schemas — run `crev schema init <name>`)"],
            })
            list.focus()
            ctx.setStatus("↑/↓ move · enter select · backspace cancel · q quit")
            list.on("select", (_item, index) => {
              if (phase.kind !== "pick-schema") return
              const schema = phase.schemas[index]
              if (!schema) return
              phase = { kind: "pick-diff", schema: schema.name }
              render()
            })
            break
          }

          case "pick-diff": {
            const list = blessed.list({
              parent: root,
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              label: ` Pick a diff source (schema: ${phase.schema}) `,
              border: "line",
              keys: true,
              mouse: true,
              tags: true,
              style: LIST_STYLE,
              items: DIFF_CHOICES.map((c) => `  ${c.label}`),
            })
            list.focus()
            ctx.setStatus("↑/↓ move · enter start · backspace back · q quit")
            list.on("select", (_item, index) => {
              if (phase.kind !== "pick-diff") return
              const choice = DIFF_CHOICES[index]
              if (!choice) return
              const base = ctx.screen.program ? "main" : "main" // dash MVP: rely on config defaults
              const diff = choice.build(base)
              phase = { kind: "running", schema: phase.schema, diff, startedAt: Date.now() }
              render()
              startRun(phase.schema, diff)
            })
            break
          }

          case "running": {
            const running = phase
            const box = blessed.box({
              parent: root,
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              tags: true,
              padding: { left: 2, right: 2, top: 1, bottom: 1 },
              content: renderRunning(running),
            })
            void box
            ctx.setStatus("running · backspace cancel after done · q quit")

            stopTicker()
            tickTimer = setInterval(() => {
              if (phase.kind !== "running" || !root) return
              // Re-render the running view so the elapsed counter ticks.
              render()
            }, 500)
            break
          }

          case "error": {
            blessed.box({
              parent: root,
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              tags: true,
              padding: { left: 2, right: 2, top: 1, bottom: 1 },
              content: `{red-fg}error:{/red-fg} ${phase.message}\n\n{gray-fg}backspace to go back{/gray-fg}`,
            })
            ctx.setStatus("backspace back · q quit")
            break
          }
        }

        ctx.screen.render()
      }

      const stopTicker = () => {
        if (tickTimer) {
          clearInterval(tickTimer)
          tickTimer = null
        }
      }

      const startRun = (schemaName: string, diff: DiffSource) => {
        const command: RunCommand = {
          schema: schemaName,
          diff,
          output: { kind: "dash" },
          target: { kind: "fresh" },
          plain: false,
          analyze: false,
        }

        void runDashEffect(runAction({ command })).then((result) => {
          stopTicker()
          if (phase.kind !== "running") return // user backed out
          if (result.kind === "error") {
            phase = { kind: "error", message: result.message }
            render()
            return
          }
          handleRunCompletion(result.value, ctx)
        })
      }

      // ── Kick off: load schema list ──
      render()
      void runDashEffect(listSchemasAction).then((result) => {
        if (result.kind === "error") {
          phase = { kind: "error", message: result.message }
        } else {
          phase = { kind: "pick-schema", schemas: result.value }
        }
        render()
      })
    },
    unmount() {
      if (tickTimer) {
        clearInterval(tickTimer)
        tickTimer = null
      }
      root?.destroy()
      root = null
    },
  }
}

export function renderRunning(phase: Extract<WizardPhase, { kind: "running" }>): string {
  const elapsed = Math.floor((Date.now() - phase.startedAt) / 1000)
  return [
    `{bold}Running review{/bold}`,
    "",
    `schema:   ${phase.schema}`,
    `diff:     ${formatDiff(phase.diff)}`,
    `elapsed:  ${elapsed}s`,
    "",
    "{gray-fg}reviewers are executing — this can take a minute or two.{/gray-fg}",
  ].join("\n")
}

export function formatDiff(d: DiffSource): string {
  switch (d.kind) {
    case "pr":
      return `PR #${d.pr}`
    case "branch":
      return `branch vs ${d.base} (${d.type})`
    case "commit":
      return `commit ${d.baseCommit} (${d.type})`
    case "local":
      return `local ${d.type}`
  }
}

function handleRunCompletion(out: RunActionOutput, ctx: AppContext): void {
  switch (out.kind) {
    case "empty":
      ctx.router.navigate({ kind: "runs" })
      return
    case "prompt-only":
      ctx.router.navigate({ kind: "runs" })
      return
    case "completed": {
      // The action doesn't currently expose the written file path; fall
      // back to the runs list and let the user pick the latest run.
      ctx.router.navigate({ kind: "runs" })
      return
    }
  }
}
