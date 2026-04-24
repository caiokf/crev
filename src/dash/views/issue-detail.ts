import blessed from "blessed"
import { showAction } from "../../actions/show.js"
import type { ReviewIssue } from "../../core/types.js"
import { runDashEffect } from "../runtime.js"
import { BOX_STYLE, DASH_COLORS } from "../theme.js"
import type { AppContext, DashView } from "../types.js"

/**
 * Issue detail view. Re-loads the parent review (same cost as the
 * run-detail view) and surfaces the selected issue's full body plus
 * its triage verdict + enrichment if present.
 *
 * The view is deliberately read-only; editing/dismissing triage
 * verdicts from the dash is out of scope for this task.
 */
export function createIssueDetailView(filePath: string, issueId: string): DashView {
  let box: blessed.Widgets.BoxElement | null = null

  return {
    route: { kind: "issue-detail", filePath, issueId },
    mount(ctx: AppContext) {
      box = blessed.box({
        parent: ctx.body,
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        label: " issue ",
        border: "line",
        tags: true,
        keys: true,
        vi: true,
        mouse: true,
        scrollable: true,
        alwaysScroll: true,
        padding: { left: 2, right: 2, top: 1, bottom: 1 },
        content: "loading…",
        style: BOX_STYLE,
      })
      box.focus()
      ctx.setStatus("[↑/↓] or [j/k] scroll · [bksp] back · [q] quit")
      ctx.screen.render()

      void runDashEffect(showAction({ filePath })).then((result) => {
        if (!box) return
        if (result.kind === "error") {
          box.setContent(`{red-fg}error:{/red-fg} ${result.message}`)
          ctx.screen.render()
          return
        }
        const issue = findIssue(result.value.result.reviews.flatMap((r) => r.issues), issueId)
        if (!issue) {
          box.setContent(`{${DASH_COLORS.warn}-fg}issue not found in review{/${DASH_COLORS.warn}-fg}`)
        } else {
          box.setContent(renderIssue(issue))
        }
        ctx.screen.render()
      })
    },
    unmount() {
      box?.destroy()
      box = null
    },
  }
}

export function findIssue(issues: readonly ReviewIssue[], id: string): ReviewIssue | undefined {
  return issues.find((i) => i.id === id)
}

export function renderIssue(issue: ReviewIssue): string {
  const lines: string[] = []
  const sevColor =
    issue.severity === "critical" || issue.severity === "high"
      ? DASH_COLORS.danger
      : issue.severity === "medium"
        ? DASH_COLORS.warn
        : "gray"

  lines.push(`{bold}${issue.title}{/bold}`)
  lines.push(
    `{${sevColor}-fg}${issue.severity}{/${sevColor}-fg} · ${issue.category} · ${issue.reviewer} {gray-fg}(${issue.runtime}/${issue.model}){/gray-fg}`,
  )
  if (issue.file) {
    lines.push(`{gray-fg}${issue.file}${issue.line ? `:${issue.line}` : ""}{/gray-fg}`)
  }
  lines.push("")
  lines.push(issue.description)

  if (issue.triage) {
    lines.push("")
    lines.push(`{bold}triage{/bold}`)
    lines.push(`verdict: ${issue.triage.verdict}`)
    lines.push(`reasoning: ${issue.triage.reasoning}`)
    const enrich = issue.triage.enrichment
    if (enrich) {
      lines.push("")
      lines.push(`{bold}suggested fix{/bold}`)
      lines.push(enrich.minimalFix.summary)
      if (enrich.minimalFix.patch) {
        lines.push("")
        lines.push(enrich.minimalFix.patch)
      }
    }
  }

  return lines.join("\n")
}
