import blessed from "../blessed-widgets-shim.js"
import type { Widgets } from "blessed"
import { listSchemasAction, type SchemaSummary } from "../../actions/list.js"
import { runAction, type RunActionOutput } from "../../actions/run.js"
import type { ProgressEvent } from "../../core/progress.js"
import type { DiffSource, RunCommand } from "../../core/types.js"
import { runDashEffect } from "../runtime.js"
import { BOX_STYLE, DASH_COLORS, LIST_STYLE } from "../theme.js"
import type { AppContext, DashView } from "../types.js"

/**
 * Interactive wizard that walks the user through starting a review
 * from within the dash. Runs `runAction` with `{ kind: "dash" }`
 * output so the orchestrator stays silent and blessed owns the
 * screen. On success, navigates to the run-detail view.
 *
 * The "running" phase subscribes to the orchestrator's `onProgress`
 * callback and renders a per-reviewer status list with a spinner,
 * elapsed counter, and result summary that update live as the
 * orchestrator emits events.
 */

export type ReviewerStatus =
  | { readonly kind: "pending" }
  | { readonly kind: "running"; readonly startedAt: number }
  | {
      readonly kind: "done"
      readonly durationMs: number
      readonly issueCount: number
      readonly exitCode: number
    }
  | { readonly kind: "failed"; readonly error: string }

export type ReviewerProgress = {
  readonly name: string
  readonly runtime?: string
  readonly model?: string
  readonly status: ReviewerStatus
}

export type TriageProgress =
  | { readonly kind: "running"; readonly startedAt: number; readonly issueCount: number }
  | {
      readonly kind: "done"
      readonly actionable: number
      readonly deferred: number
      readonly dismissed: number
      readonly durationMs: number
    }

type WizardPhase =
  | { kind: "loading" }
  | { kind: "pick-schema"; schemas: SchemaSummary[] }
  | { kind: "pick-diff"; schema: string }
  | {
      kind: "running"
      schema: string
      diff: DiffSource
      analyze: boolean
      startedAt: number
      reviewers: ReviewerProgress[]
      triage: TriageProgress | null
    }
  | { kind: "error"; message: string }

const SPINNER_FRAMES = ["⣾", "⣽", "⣻", "⢿", "⡿", "⣟", "⣯", "⣷"] as const

type DiffChoice = {
  readonly label: string
  readonly hint: string
  readonly build: (defaultBase: string) => { diff: DiffSource; analyze: boolean }
}

export const DIFF_CHOICES: ReadonlyArray<DiffChoice> = [
  {
    label: "Uncommitted changes",
    hint: "",
    build: () => ({ diff: { kind: "local", type: "uncommitted" }, analyze: false }),
  },
  {
    label: "All local changes",
    hint: "committed + uncommitted",
    build: () => ({ diff: { kind: "local", type: "all" }, analyze: false }),
  },
  {
    label: "Branch vs base",
    hint: "from config defaults.base",
    build: (base) => ({ diff: { kind: "branch", base, type: "all" }, analyze: false }),
  },
  {
    label: "Full repo analysis",
    hint: "--analyze, no diff",
    build: () => ({ diff: { kind: "local", type: "all" }, analyze: true }),
  },
]

export function createRunWizardView(preselectedSchema?: string): DashView {
  let phase: WizardPhase = { kind: "loading" }
  let root: Widgets.BoxElement | null = null
  let tickTimer: NodeJS.Timeout | null = null

  const destroyChildren = () => {
    if (root) {
      for (const child of [...root.children]) child.destroy()
    }
  }

  return {
    route: { kind: "run-wizard", schema: preselectedSchema },
    mount(ctx: AppContext) {
      root = blessed.box({
        parent: ctx.body,
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        label: " new review ",
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
              label: " pick a schema ",
              border: "line",
              keys: true,
              vi: true,
              mouse: true,
              tags: true,
              style: LIST_STYLE,
              items: phase.schemas.length
                ? phase.schemas.map((s) => `  ${s.name}  {gray-fg}${s.description || ""}{/gray-fg}`)
                : ["  (no schemas — run `crev schema init <name>`)"],
            })
            list.focus()
            ctx.setStatus("[↑/↓] or [j/k] move · [enter] select · [bksp] cancel · [q] quit")
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
              label: ` pick a diff source (schema: ${phase.schema}) `,
              border: "line",
              keys: true,
              vi: true,
              mouse: true,
              tags: true,
              style: LIST_STYLE,
              items: DIFF_CHOICES.map((c) =>
                c.hint
                  ? `  ${c.label}  {gray-fg}(${c.hint}){/gray-fg}`
                  : `  ${c.label}`,
              ),
            })
            list.focus()
            ctx.setStatus("[↑/↓] or [j/k] move · [enter] start · [bksp] back · [q] quit")
            list.on("select", (_item, index) => {
              if (phase.kind !== "pick-diff") return
              const choice = DIFF_CHOICES[index]
              if (!choice) return
              const base = "main" // dash MVP: rely on config defaults
              const { diff, analyze } = choice.build(base)
              phase = {
                kind: "running",
                schema: phase.schema,
                diff,
                analyze,
                startedAt: Date.now(),
                reviewers: [],
                triage: null,
              }
              render()
              startRun(phase.schema, diff, analyze)
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
            ctx.setStatus("running · [bksp] cancel after done · [q] quit")

            stopTicker()
            tickTimer = setInterval(() => {
              if (phase.kind !== "running" || !root) return
              // Re-render so the spinner frame + elapsed counters tick.
              render()
            }, 120)
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
              content: `{red-fg}error:{/red-fg} ${phase.message}\n\n{gray-fg}[bksp] to go back{/gray-fg}`,
            })
            ctx.setStatus("[bksp] back · [q] quit")
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

      const onProgress = (event: ProgressEvent): void => {
        if (phase.kind !== "running") return
        phase = {
          ...phase,
          ...applyProgress(phase, event),
        }
        render()
      }

      const startRun = (schemaName: string, diff: DiffSource, analyze: boolean) => {
        const command: RunCommand = {
          schema: schemaName,
          diff,
          output: { kind: "dash" },
          target: { kind: "fresh" },
          plain: false,
          analyze,
        }

        ctx.setQuitGuard(() =>
          phase.kind === "running"
            ? "A review is still running. Quit anyway?"
            : null,
        )

        void runDashEffect(runAction({ command, onProgress })).then((result) => {
          stopTicker()
          ctx.setQuitGuard(null)
          if (phase.kind !== "running") return // user backed out
          if (result.kind === "error") {
            phase = { kind: "error", message: result.message }
            render()
            return
          }
          handleRunCompletion(result.value, ctx)
        })
      }

      // ── Kick off: load schema list (or skip to diff picker) ──
      render()
      if (preselectedSchema) {
        phase = { kind: "pick-diff", schema: preselectedSchema }
        render()
      } else {
        void runDashEffect(listSchemasAction).then((result) => {
          if (result.kind === "error") {
            phase = { kind: "error", message: result.message }
          } else {
            phase = { kind: "pick-schema", schemas: result.value }
          }
          render()
        })
      }
    },
    unmount() {
      if (tickTimer) {
        clearInterval(tickTimer)
        tickTimer = null
      }
      root?.destroy()
      root = null
      // Intentionally leave the quit guard in place: an in-flight run
      // outlives the view, and the user should still be warned about
      // discarding it. The guard clears itself when the run resolves.
    },
  }
}

export function renderRunning(phase: Extract<WizardPhase, { kind: "running" }>): string {
  const now = Date.now()
  const elapsed = Math.floor((now - phase.startedAt) / 1000)
  const frame = SPINNER_FRAMES[Math.floor(now / 80) % SPINNER_FRAMES.length]!

  const lines: string[] = []
  lines.push(`{bold}running review{/bold}`)
  lines.push("")
  lines.push(`schema:   {${DASH_COLORS.accent}-fg}${phase.schema}{/${DASH_COLORS.accent}-fg}`)
  lines.push(
    `diff:     ${phase.analyze ? `{${DASH_COLORS.warn}-fg}full repo analysis{/${DASH_COLORS.warn}-fg}` : formatDiff(phase.diff)}`,
  )
  lines.push(`elapsed:  ${elapsed}s`)
  lines.push("")

  if (phase.reviewers.length === 0) {
    lines.push(`{gray-fg}${frame} starting reviewers…{/gray-fg}`)
  } else {
    lines.push(`{bold}reviewers{/bold}`)
    const nameWidth = Math.min(
      24,
      Math.max(6, ...phase.reviewers.map((r) => r.name.length)),
    )
    for (const rv of phase.reviewers) {
      lines.push(formatReviewerLine(rv, nameWidth, frame, now))
    }
  }

  if (phase.triage) {
    lines.push("")
    lines.push(formatTriageLine(phase.triage, frame, now))
  }

  return lines.join("\n")
}

function formatReviewerLine(
  rv: ReviewerProgress,
  nameWidth: number,
  frame: string,
  now: number,
): string {
  const name = rv.name.padEnd(nameWidth)
  const source = rv.runtime && rv.model ? `{gray-fg}${rv.runtime}/${rv.model}{/gray-fg}` : ""

  switch (rv.status.kind) {
    case "pending":
      return `  {gray-fg}⋯{/gray-fg}  ${name}  ${source}  {gray-fg}pending{/gray-fg}`
    case "running": {
      const elapsed = Math.floor((now - rv.status.startedAt) / 1000)
      return (
        `  {${DASH_COLORS.accent}-fg}${frame}{/${DASH_COLORS.accent}-fg}  ` +
        `${name}  ${source}  ` +
        `{${DASH_COLORS.accent}-fg}${elapsed}s{/${DASH_COLORS.accent}-fg}`
      )
    }
    case "done": {
      const ok = rv.status.exitCode === 0
      const icon = ok
        ? `{${DASH_COLORS.ok}-fg}✓{/${DASH_COLORS.ok}-fg}`
        : `{${DASH_COLORS.danger}-fg}✗{/${DASH_COLORS.danger}-fg}`
      const elapsed = (rv.status.durationMs / 1000).toFixed(1)
      const issues = rv.status.issueCount
      const issueColor = issues === 0 ? DASH_COLORS.ok : issues >= 10 ? DASH_COLORS.danger : DASH_COLORS.warn
      const result = ok
        ? `{${issueColor}-fg}${issues} issue${issues === 1 ? "" : "s"}{/${issueColor}-fg}`
        : `{${DASH_COLORS.danger}-fg}exit ${rv.status.exitCode}{/${DASH_COLORS.danger}-fg}`
      return `  ${icon}  ${name}  ${source}  ${result} {gray-fg}(${elapsed}s){/gray-fg}`
    }
    case "failed":
      return (
        `  {${DASH_COLORS.danger}-fg}✗{/${DASH_COLORS.danger}-fg}  ` +
        `${name}  ${source}  ` +
        `{${DASH_COLORS.danger}-fg}${rv.status.error}{/${DASH_COLORS.danger}-fg}`
      )
  }
}

function formatTriageLine(triage: TriageProgress, frame: string, now: number): string {
  if (triage.kind === "running") {
    const elapsed = Math.floor((now - triage.startedAt) / 1000)
    return `  {${DASH_COLORS.accent}-fg}${frame}{/${DASH_COLORS.accent}-fg}  triage · {gray-fg}${triage.issueCount} issue${triage.issueCount === 1 ? "" : "s"}{/gray-fg}  {${DASH_COLORS.accent}-fg}${elapsed}s{/${DASH_COLORS.accent}-fg}`
  }
  const elapsed = (triage.durationMs / 1000).toFixed(1)
  return (
    `  {${DASH_COLORS.ok}-fg}✓{/${DASH_COLORS.ok}-fg}  triage  ` +
    `{${DASH_COLORS.ok}-fg}${triage.actionable} actionable{/${DASH_COLORS.ok}-fg} · ` +
    `{${DASH_COLORS.warn}-fg}${triage.deferred} deferred{/${DASH_COLORS.warn}-fg} · ` +
    `{gray-fg}${triage.dismissed} dismissed{/gray-fg} {gray-fg}(${elapsed}s){/gray-fg}`
  )
}

export function applyProgress(
  phase: Extract<WizardPhase, { kind: "running" }>,
  event: ProgressEvent,
): Pick<Extract<WizardPhase, { kind: "running" }>, "reviewers" | "triage"> {
  switch (event.kind) {
    case "run-started":
    case "run-completed":
    case "run-failed":
      return { reviewers: phase.reviewers, triage: phase.triage }

    case "reviewer-started": {
      const existing = phase.reviewers.find((r) => r.name === event.name)
      const next: ReviewerProgress = {
        name: event.name,
        runtime: event.runtime,
        model: event.model,
        status: { kind: "running", startedAt: Date.now() },
      }
      const reviewers = existing
        ? phase.reviewers.map((r) => (r.name === event.name ? next : r))
        : [...phase.reviewers, next]
      return { reviewers, triage: phase.triage }
    }

    case "reviewer-completed": {
      const reviewers = phase.reviewers.map((r) =>
        r.name === event.name
          ? {
              ...r,
              status: {
                kind: "done" as const,
                durationMs: event.durationMs,
                issueCount: event.issueCount,
                exitCode: event.exitCode,
              },
            }
          : r,
      )
      return { reviewers, triage: phase.triage }
    }

    case "reviewer-failed": {
      const reviewers = phase.reviewers.map((r) =>
        r.name === event.name
          ? { ...r, status: { kind: "failed" as const, error: event.error } }
          : r,
      )
      return { reviewers, triage: phase.triage }
    }

    case "triage-started":
      return {
        reviewers: phase.reviewers,
        triage: { kind: "running", startedAt: Date.now(), issueCount: event.issueCount },
      }

    case "triage-completed":
      return {
        reviewers: phase.reviewers,
        triage: {
          kind: "done",
          actionable: event.actionable,
          deferred: event.deferred,
          dismissed: event.dismissed,
          durationMs: event.durationMs,
        },
      }
  }
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
