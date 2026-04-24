import blessed from "blessed"
import path from "node:path"
import { showAction } from "../../actions/show.js"
import type { ReviewIssue, ReviewResult } from "../../core/types.js"
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
        label: ` Run · ${path.basename(filePath)} `,
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
        label: " Issues ",
        border: "line",
        keys: true,
        mouse: true,
        tags: true,
        items: ["  loading…"],
        style: LIST_STYLE,
      })
      issueList.focus()
      ctx.setStatus("↑/↓ move · enter open · backspace back · q quit")
      ctx.screen.render()

      issueList.on("select", (_item, index) => {
        const issue = issues[index]
        if (!issue) return
        ctx.router.navigate({ kind: "issue-detail", filePath, issueId: issue.id })
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
  lines.push(`schema: ${r.metadata.schema}`)
  lines.push(`diff: ${r.metadata.diffType}${r.metadata.diffBase ? ` vs ${r.metadata.diffBase}` : ""}`)
  if (r.metadata.description) lines.push(`desc: ${r.metadata.description}`)
  lines.push("")

  lines.push(`{bold}Summary{/bold}`)
  lines.push(`total issues: ${r.summary.totalIssues}`)
  if (r.summary.triage) {
    lines.push(
      `triage: ${r.summary.triage.actionable} actionable · ${r.summary.triage.deferred} deferred · ${r.summary.triage.dismissed} dismissed`,
    )
  }
  lines.push("")

  lines.push(`{bold}Reviewers{/bold}`)
  for (const rv of r.reviews) {
    const count = rv.issues.length
    lines.push(`  ${rv.reviewer} {gray-fg}${rv.runtime}/${rv.model}{/gray-fg}: ${count}`)
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
