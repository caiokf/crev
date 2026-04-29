import blessed from "../blessed-widgets-shim.js"
import type { Widgets } from "blessed"
import fs from "node:fs"
import path from "node:path"
import { showSchemaAction, type SchemaDetail } from "../../actions/schema.js"
import { statsAction, type RevisionGroup, type ReviewerStats } from "../../actions/stats.js"
import { resolveAgentPath } from "../../core/agent-path.js"
import { runDashEffect } from "../runtime.js"
import { BOX_STYLE, DASH_COLORS, LIST_STYLE, escapeTags } from "../theme.js"
import type { AppContext, DashView } from "../types.js"

type Reviewer = SchemaDetail["reviewers"][number]

export type ReviewerPromptInfo =
  | { readonly kind: "inline"; readonly prompt: string }
  | {
      readonly kind: "agent"
      readonly ref: string
      readonly resolvedPath: string
      readonly content: string | null
      readonly error: string | null
    }
  | { readonly kind: "none" }

/**
 * Schema detail view. Split layout mirroring run-detail: the left
 * pane shows schema metadata (name, description, source, triage)
 * plus a selectable reviewer list; the right pane shows the prompt
 * for the selected reviewer. Reviewers can either carry an inline
 * prompt or point to an external agent file — the right pane reads
 * and displays the file content when possible, or surfaces a
 * "not found" message if the reference is broken.
 */
export function createSchemaDetailView(name: string): DashView {
  let outer: Widgets.BoxElement | null = null
  let metaBox: Widgets.BoxElement | null = null
  let reviewerList: Widgets.ListElement | null = null
  let promptBox: Widgets.BoxElement | null = null
  let detail: SchemaDetail | null = null
  let promptInfos: ReviewerPromptInfo[] = []

  return {
    route: { kind: "schema-detail", name },
    mount(ctx: AppContext) {
      outer = blessed.box({
        parent: ctx.body,
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        label: ` schema · ${name} `,
        border: "line",
        style: BOX_STYLE,
      })

      metaBox = blessed.box({
        parent: outer,
        top: 0,
        left: 0,
        width: "40%",
        height: 1,
        tags: true,
        padding: { left: 1, right: 1, top: 1, bottom: 0 },
        content: "loading…",
      })

      reviewerList = blessed.list({
        parent: outer,
        top: 1,
        left: 0,
        width: "40%",
        bottom: 0,
        label: " reviewers ",
        border: "line",
        keys: true,
        vi: true,
        mouse: true,
        tags: true,
        items: ["  loading…"],
        style: LIST_STYLE,
      })

      promptBox = blessed.box({
        parent: outer,
        top: 0,
        left: "40%",
        right: 0,
        bottom: 0,
        label: " prompt ",
        border: "line",
        tags: true,
        keys: true,
        vi: true,
        mouse: true,
        scrollable: true,
        alwaysScroll: true,
        padding: { left: 1, right: 1, top: 0, bottom: 0 },
        content: `{gray-fg}select a reviewer to view its prompt{/gray-fg}`,
        style: BOX_STYLE,
      })

      reviewerList.focus()
      ctx.setStatus("[↑/↓] or [j/k] move · [n] new review · [bksp] back · [q] quit")

      reviewerList.key("n", () => {
        ctx.router.navigate({ kind: "run-wizard", schema: name })
      })

      ctx.screen.render()

      const refreshPrompt = (index: number): void => {
        if (!promptBox) return
        const info = promptInfos[index]
        const reviewer = detail?.reviewers[index]
        if (!info || !reviewer) {
          promptBox.setContent("")
        } else {
          promptBox.setContent(renderReviewerPrompt(info, reviewer))
          promptBox.setLabel(` prompt · ${reviewer.name} `)
          promptBox.scrollTo(0)
        }
        ctx.screen.render()
      }

      reviewerList.on("select item", (_item, index) => {
        refreshPrompt(index)
      })

      const updateMeta = (statsRevision?: RevisionGroup | null): void => {
        if (!metaBox || !reviewerList || !detail) return
        const metaContent = renderSchemaMeta(detail, ctx.crevDir, statsRevision)
        const metaHeight = metaContent.split("\n").length
        metaBox.height = metaHeight + 2
        metaBox.setContent(metaContent)
        reviewerList.top = metaHeight + 2
        ctx.screen.render()
      }

      void runDashEffect(showSchemaAction(name)).then((result) => {
        if (!metaBox || !reviewerList || !promptBox) return
        if (result.kind === "error") {
          metaBox.height = 1
          metaBox.setContent(`{red-fg}error:{/red-fg} ${result.message}`)
          reviewerList.top = 1
          reviewerList.setItems([])
          promptBox.setContent("")
          ctx.screen.render()
          return
        }

        detail = result.value
        updateMeta()

        if (detail.reviewers.length === 0) {
          reviewerList.setItems(["  {gray-fg}(no reviewers){/gray-fg}"])
          promptBox.setContent("{gray-fg}(no reviewers to inspect){/gray-fg}")
        } else {
          reviewerList.setItems(detail.reviewers.map(formatReviewerRow))
          promptInfos = detail.reviewers.map((r) =>
            loadReviewerPrompt(r, detail!.path, ctx.crevDir),
          )
          reviewerList.select(0)
          refreshPrompt(0)
        }
        ctx.screen.render()

        // Load stats in background — non-blocking, appends to meta when ready
        void runDashEffect(statsAction({ schema: name })).then((statsResult) => {
          if (statsResult.kind !== "ok" || !detail) return
          const schemaStats = statsResult.value.bySchema[name]
          const latest = schemaStats?.revisions[schemaStats.revisions.length - 1]
          updateMeta(latest ?? null)
        })
      })
    },
    unmount() {
      promptBox?.destroy()
      reviewerList?.destroy()
      metaBox?.destroy()
      outer?.destroy()
      outer = null
      metaBox = null
      reviewerList = null
      promptBox = null
      detail = null
      promptInfos = []
    },
  }
}

/**
 * Left-pane header text: schema identity + triage summary + optional
 * stats from the latest revision. Kept intentionally compact so the
 * reviewer list below gets the bulk of the vertical space.
 */
export function renderSchemaMeta(
  detail: SchemaDetail,
  crevDir: string,
  stats?: RevisionGroup | null,
): string {
  const lines: string[] = []
  const relPath = path.relative(crevDir, detail.path) || detail.path

  lines.push(`{bold}${escapeTags(detail.name)}{/bold}`)
  if (detail.description) {
    lines.push(`{gray-fg}${escapeTags(detail.description)}{/gray-fg}`)
  }
  lines.push(`{gray-fg}source: ${escapeTags(relPath)}{/gray-fg}`)

  if (detail.triage) {
    lines.push("")
    const state = detail.triage.enabled
      ? `{${DASH_COLORS.ok}-fg}enabled{/${DASH_COLORS.ok}-fg}`
      : `{gray-fg}disabled{/gray-fg}`
    lines.push(`{bold}triage{/bold} ${state}`)
    if (detail.triage.enabled) {
      lines.push(
        `{gray-fg}runtime: ${escapeTags(detail.triage.runtime ?? "")}/${escapeTags(detail.triage.model ?? "")}{/gray-fg}`,
      )
    }
  }

  if (stats !== undefined) {
    lines.push("")
    if (stats) {
      lines.push(renderStats(stats))
    } else {
      lines.push(`{bold}stats{/bold} {gray-fg}no runs yet{/gray-fg}`)
    }
    lines.push("")
  }

  return lines.join("\n")
}

export function renderStats(rev: RevisionGroup): string {
  const lines: string[] = []
  const dateRange = formatDateRange(rev.firstDate, rev.lastDate)
  lines.push(
    `{bold}stats{/bold} {gray-fg}${rev.runs} run${rev.runs !== 1 ? "s" : ""} · ${dateRange}{/gray-fg}`,
  )

  if (rev.reviewerStats.length > 0) {
    const nameW = Math.max(6, ...rev.reviewerStats.map((s) => s.reviewer.length))

    for (const s of rev.reviewerStats) {
      const name = escapeTags(s.reviewer.padEnd(nameW))
      if (rev.hasTriage) {
        const triaged = s.actionable + s.deferred + s.dismissed
        const actPct = triaged > 0 ? `${Math.round((s.actionable / triaged) * 100)}%` : "—"
        const disPct = triaged > 0 ? `${Math.round((s.dismissed / triaged) * 100)}%` : "—"
        const avgTime = `${(s.avgDurationMs / 1000).toFixed(0)}s`
        lines.push(
          `  {${DASH_COLORS.accent}-fg}${name}{/${DASH_COLORS.accent}-fg} ` +
            `{gray-fg}${String(s.totalIssues).padStart(3)} issues{/gray-fg}  ` +
            `{${DASH_COLORS.ok}-fg}${actPct.padStart(3)} act{/${DASH_COLORS.ok}-fg}  ` +
            `{gray-fg}${disPct.padStart(3)} dis{/gray-fg}  ` +
            `{gray-fg}${avgTime}{/gray-fg}`,
        )
      } else {
        const avgIssues = (s.totalIssues / s.runs).toFixed(1)
        const avgTime = `${(s.avgDurationMs / 1000).toFixed(0)}s`
        lines.push(
          `  {${DASH_COLORS.accent}-fg}${name}{/${DASH_COLORS.accent}-fg} ` +
            `{gray-fg}${String(s.totalIssues).padStart(3)} issues  ${avgIssues}/run  ${avgTime}{/gray-fg}`,
        )
      }
    }
  }

  return lines.join("\n")
}

function formatDateRange(first: string, last: string): string {
  const f = formatShortDate(first)
  const l = formatShortDate(last)
  return f === l ? f : `${f} → ${l}`
}

function formatShortDate(iso: string): string {
  const d = new Date(iso)
  const months = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ]
  return `${months[d.getMonth()]} ${d.getDate()}`
}

export function formatReviewerRow(reviewer: Reviewer): string {
  const name = escapeTags(reviewer.name)
  const runtimeModel = `${escapeTags(reviewer.runtime)}/${escapeTags(reviewer.model)}`
  const source = reviewer.agent
    ? `{gray-fg}→ ${escapeTags(reviewer.agent)}{/gray-fg}`
    : reviewer.prompt
      ? `{gray-fg}(inline prompt){/gray-fg}`
      : `{gray-fg}(no prompt){/gray-fg}`
  return `  {${DASH_COLORS.accent}-fg}${name}{/${DASH_COLORS.accent}-fg} {gray-fg}${runtimeModel}{/gray-fg} ${source}`
}

/**
 * Resolve + load the prompt for a reviewer. Inline prompts are
 * returned verbatim; agent refs are resolved via the shared path
 * rules and the file is read synchronously (small, read once per
 * selection change). Missing files surface as a structured error
 * rather than throwing so the view can render a friendly message.
 */
export function loadReviewerPrompt(
  reviewer: Reviewer,
  schemaPath: string,
  crevDir: string,
): ReviewerPromptInfo {
  if (reviewer.prompt) return { kind: "inline", prompt: reviewer.prompt }
  if (reviewer.agent) {
    const resolved = resolveAgentPath(reviewer.agent, { schemaPath, crevDir })
    if (!fs.existsSync(resolved)) {
      return {
        kind: "agent",
        ref: reviewer.agent,
        resolvedPath: resolved,
        content: null,
        error: "Agent file not found",
      }
    }
    try {
      const content = fs.readFileSync(resolved, "utf-8")
      return { kind: "agent", ref: reviewer.agent, resolvedPath: resolved, content, error: null }
    } catch (cause) {
      return {
        kind: "agent",
        ref: reviewer.agent,
        resolvedPath: resolved,
        content: null,
        error: cause instanceof Error ? cause.message : String(cause),
      }
    }
  }
  return { kind: "none" }
}

export function renderReviewerPrompt(info: ReviewerPromptInfo, reviewer: Reviewer): string {
  const lines: string[] = []
  lines.push(
    `{${DASH_COLORS.accent}-fg}{bold}${escapeTags(reviewer.name)}{/bold}{/${DASH_COLORS.accent}-fg} {gray-fg}${escapeTags(reviewer.runtime)}/${escapeTags(reviewer.model)}{/gray-fg}`,
  )
  lines.push("")

  switch (info.kind) {
    case "inline":
      lines.push(`{gray-fg}inline prompt{/gray-fg}`)
      lines.push("")
      lines.push(escapeTags(info.prompt))
      break
    case "agent":
      lines.push(`{gray-fg}agent file:{/gray-fg} ${escapeTags(info.ref)}`)
      lines.push(`{gray-fg}resolved:{/gray-fg} ${escapeTags(info.resolvedPath)}`)
      lines.push("")
      if (info.error) {
        lines.push(`{${DASH_COLORS.danger}-fg}${escapeTags(info.error)}{/${DASH_COLORS.danger}-fg}`)
      } else if (info.content !== null) {
        lines.push(escapeTags(info.content))
      }
      break
    case "none":
      lines.push(`{gray-fg}(no prompt configured){/gray-fg}`)
      break
  }

  return lines.join("\n")
}
