import blessed from "blessed"
import path from "node:path"
import { showAction } from "../../actions/show.js"
import type { ReviewIssue, ReviewResult } from "../../core/types.js"
import { openInEditor } from "../editor.js"
import { runDashEffect } from "../runtime.js"
import { LIST_STYLE, BOX_STYLE, DASH_COLORS } from "../theme.js"
import type { AppContext, DashView } from "../types.js"

/**
 * Run detail view. Left pane shows run metadata + per-reviewer issue
 * counts; right pane is a scrollable list of every issue across the
 * run, grouped by reviewer. Selecting an issue navigates to the
 * issue-detail view.
 */
export function createRunDetailView(filePath: string): DashView {
  let outer: blessed.Widgets.BoxElement | null = null
  let meta: blessed.Widgets.BoxElement | null = null
  let issueList: blessed.Widgets.ListElement | null = null
  let issues: ReviewIssue[] = []

  return {
    route: { kind: "run-detail", filePath },
    mount(ctx: AppContext) {
      outer = blessed.box({
        parent: ctx.body,
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        label: ` run · ${path.basename(filePath)} `,
        border: "line",
        style: BOX_STYLE,
      })

      meta = blessed.box({
        parent: outer,
        top: 0,
        left: 0,
        width: "40%",
        bottom: 0,
        tags: true,
        scrollable: true,
        alwaysScroll: true,
        padding: { left: 1, right: 1, top: 0, bottom: 0 },
        content: "loading…",
      })

      issueList = blessed.list({
        parent: outer,
        top: 0,
        left: "40%",
        right: 0,
        bottom: 0,
        label: " issues ",
        border: "line",
        keys: true,
        vi: true,
        mouse: true,
        tags: true,
        items: ["  loading…"],
        style: LIST_STYLE,
      })
      issueList.focus()
      ctx.setStatus("[↑/↓] or [j/k] move · [enter] open · [e] editor · [bksp] back · [q] quit")
      ctx.screen.render()

      issueList.on("select", (_item, index) => {
        const issue = issues[index]
        if (!issue) return
        ctx.router.navigate({ kind: "issue-detail", filePath, issueId: issue.id })
      })

      issueList.key("e", () => {
        void openInEditor(ctx.screen, filePath).catch((err) => {
          ctx.setStatus(`editor failed: ${err instanceof Error ? err.message : String(err)}`)
          ctx.screen.render()
        })
      })

      void runDashEffect(showAction({ filePath })).then((result) => {
        if (!meta || !issueList) return
        if (result.kind === "error") {
          meta.setContent(`{red-fg}error:{/red-fg} ${result.message}`)
          issueList.setItems([])
          ctx.screen.render()
          return
        }
        const review = result.value.result
        meta.setContent(renderMeta(review))
        issues = flattenIssues(review)
        if (issues.length === 0) {
          issueList.setItems(["  {gray-fg}(no issues){/gray-fg}"])
        } else {
          issueList.setItems(issues.map(formatIssueRow))
        }
        ctx.screen.render()
      })
    },
    unmount() {
      issueList?.destroy()
      meta?.destroy()
      outer?.destroy()
      outer = null
      meta = null
      issueList = null
      issues = []
    },
  }
}

export function renderMeta(r: ReviewResult): string {
  const lines: string[] = []
  lines.push(`{bold}${r.metadata.slug}{/bold}`)
  lines.push(`{gray-fg}${r.metadata.timestamp}{/gray-fg}`)
  lines.push(`schema: {${DASH_COLORS.accent}-fg}${r.metadata.schema}{/${DASH_COLORS.accent}-fg}`)
  lines.push(`diff: ${r.metadata.diffType}${r.metadata.diffBase ? ` vs ${r.metadata.diffBase}` : ""}`)
  if (r.metadata.description) lines.push(`desc: ${r.metadata.description}`)
  lines.push("")

  lines.push(`{bold}summary{/bold}`)
  const totalColor =
    r.summary.totalIssues === 0
      ? DASH_COLORS.ok
      : r.summary.totalIssues >= 10
        ? DASH_COLORS.danger
        : DASH_COLORS.warn
  lines.push(`total issues: {${totalColor}-fg}${r.summary.totalIssues}{/${totalColor}-fg}`)
  if (r.summary.triage) {
    lines.push(
      `triage: {${DASH_COLORS.ok}-fg}${r.summary.triage.actionable} actionable{/${DASH_COLORS.ok}-fg} · {${DASH_COLORS.warn}-fg}${r.summary.triage.deferred} deferred{/${DASH_COLORS.warn}-fg} · {gray-fg}${r.summary.triage.dismissed} dismissed{/gray-fg}`,
    )
  }
  lines.push("")

  lines.push(`{bold}reviewers{/bold}`)
  for (const rv of r.reviews) {
    const count = rv.issues.length
    const countColor = count === 0 ? DASH_COLORS.ok : count >= 10 ? DASH_COLORS.danger : DASH_COLORS.warn
    lines.push(
      `  {${DASH_COLORS.accent}-fg}${rv.reviewer}{/${DASH_COLORS.accent}-fg} {gray-fg}${rv.runtime}/${rv.model}{/gray-fg}: {${countColor}-fg}${count}{/${countColor}-fg}`,
    )
  }

  return lines.join("\n")
}

export function flattenIssues(r: ReviewResult): ReviewIssue[] {
  const out: ReviewIssue[] = []
  for (const rv of r.reviews) {
    for (const issue of rv.issues) out.push(issue)
  }
  return out
}

export function formatIssueRow(issue: ReviewIssue): string {
  const sev = severityTag(issue.severity)
  const reviewer = issue.reviewer.padEnd(12)
  const where = issue.file ? `{gray-fg}${issue.file}${issue.line ? `:${issue.line}` : ""}{/gray-fg}` : ""
  return `  ${sev} ${reviewer} ${issue.title} ${where}`
}

function severityTag(severity: ReviewIssue["severity"]): string {
  switch (severity) {
    case "critical":
      return `{${DASH_COLORS.danger}-fg}{bold}CRIT{/bold}{/${DASH_COLORS.danger}-fg}`
    case "high":
      return `{${DASH_COLORS.danger}-fg}HIGH{/${DASH_COLORS.danger}-fg}`
    case "medium":
      return `{${DASH_COLORS.warn}-fg} MED{/${DASH_COLORS.warn}-fg}`
    case "low":
      return `{gray-fg} LOW{/gray-fg}`
  }
}
