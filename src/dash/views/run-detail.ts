import blessed from "../blessed-widgets-shim.js"
import type { Widgets } from "blessed"
import path from "node:path"
import { showAction } from "../../actions/show.js"
import { setVerdictAction } from "../../actions/verdict.js"
import type { ReviewIssue, ReviewResult, TriageVerdict } from "../../core/types.js"
import { openInEditor } from "../editor.js"
import { runDashEffect } from "../runtime.js"
import { LIST_STYLE, BOX_STYLE, DASH_COLORS, escapeTags } from "../theme.js"
import type { AppContext, DashView } from "../types.js"

/**
 * Remembers the last-selected issue index per run file across
 * unmount/remount cycles. Without this, navigating into an issue and
 * backing out resets the cursor to the top of the list — annoying
 * when triaging dozens of findings.
 */
const lastSelectedIndex = new Map<string, number>()

/**
 * Run detail view. Left pane shows run metadata + per-reviewer issue
 * counts; right pane is a scrollable list of every issue across the
 * run, grouped by reviewer. Selecting an issue navigates to the
 * issue-detail view.
 */
export function createRunDetailView(filePath: string): DashView {
  let outer: Widgets.BoxElement | null = null
  let meta: Widgets.BoxElement | null = null
  let issueList: Widgets.ListElement | null = null
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
      ctx.setStatus(
        "[↑/↓] or [j/k] move · [enter] open · [a]actionable [d]deferred [x]dismissed · [e] editor · [bksp] back · [q] quit",
      )
      ctx.screen.render()

      issueList.on("select", (_item, index) => {
        const issue = issues[index]
        if (!issue) return
        lastSelectedIndex.set(filePath, index)
        ctx.router.navigate({ kind: "issue-detail", filePath, issueId: issue.id })
      })

      issueList.key("e", () => {
        void openInEditor(ctx.screen, filePath).catch((err) => {
          ctx.setStatus(`editor failed: ${err instanceof Error ? err.message : String(err)}`)
          ctx.screen.render()
        })
      })

      const applyVerdictToCursor = (verdict: TriageVerdict["verdict"]): void => {
        if (!issueList || issues.length === 0) return
        const selected = (issueList as unknown as { selected?: number }).selected ?? 0
        const issue = issues[selected]
        if (!issue) return
        ctx.setStatus(`{gray-fg}setting verdict → ${verdict}…{/gray-fg}`)
        ctx.screen.render()
        void runDashEffect(
          setVerdictAction({ filePath, issueId: issue.id, verdict }),
        ).then((result) => {
          if (!meta || !issueList) return
          if (result.kind === "error") {
            ctx.setStatus(
              `{${DASH_COLORS.danger}-fg}verdict update failed: ${result.message}{/${DASH_COLORS.danger}-fg}`,
            )
            ctx.screen.render()
            return
          }
          // Mutate in place so the dot prefix updates without us losing
          // the cursor position or reflowing column widths.
          issues[selected] = result.value.issue
          const widths = computeIssueWidths(issues)
          issueList.setItems(issues.map((i) => formatIssueRow(i, widths)))
          issueList.select(selected)
          meta.setContent(renderMeta(result.value.result))
          const verdictColor =
            verdict === "actionable"
              ? DASH_COLORS.ok
              : verdict === "deferred"
                ? DASH_COLORS.warn
                : "gray"
          ctx.setStatus(
            `{${verdictColor}-fg}✓ verdict → ${verdict}{/${verdictColor}-fg}`,
          )
          ctx.screen.render()
        })
      }

      issueList.key("a", () => applyVerdictToCursor("actionable"))
      issueList.key("d", () => applyVerdictToCursor("deferred"))
      issueList.key("x", () => applyVerdictToCursor("dismissed"))

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
          const widths = computeIssueWidths(issues)
          issueList.setItems(issues.map((issue) => formatIssueRow(issue, widths)))
          // Restore the previous selection if we're re-entering the
          // view (e.g. the user pressed [bksp] from issue-detail).
          const prev = lastSelectedIndex.get(filePath)
          if (prev !== undefined && prev < issues.length) {
            issueList.select(prev)
          }
        }
        ctx.screen.render()
      })
    },
    unmount() {
      // Capture the cursor position before tearing the list down so
      // plain arrow-scrolling (without pressing enter) is preserved
      // too, not just explicit selections.
      if (issueList && issues.length > 0) {
        const current = (issueList as unknown as { selected?: number }).selected
        if (typeof current === "number") lastSelectedIndex.set(filePath, current)
      }
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
  lines.push(`{bold}${escapeTags(r.metadata.slug)}{/bold}`)
  lines.push(`{gray-fg}${r.metadata.timestamp}{/gray-fg}`)
  lines.push(`schema: {${DASH_COLORS.accent}-fg}${escapeTags(r.metadata.schema)}{/${DASH_COLORS.accent}-fg}`)
  lines.push(`diff: ${r.metadata.diffType}${r.metadata.diffBase ? ` vs ${escapeTags(r.metadata.diffBase)}` : ""}`)
  if (r.metadata.description) lines.push(`desc: ${escapeTags(r.metadata.description)}`)
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
      `  {${DASH_COLORS.accent}-fg}${escapeTags(rv.reviewer)}{/${DASH_COLORS.accent}-fg} {gray-fg}${escapeTags(rv.runtime)}/${escapeTags(rv.model)}{/gray-fg}: {${countColor}-fg}${count}{/${countColor}-fg}`,
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

export type IssueColumnWidths = {
  readonly reviewer: number
  readonly title: number
}

const MAX_REVIEWER_WIDTH = 20
const MAX_TITLE_WIDTH = 60

export function computeIssueWidths(issues: ReadonlyArray<ReviewIssue>): IssueColumnWidths {
  const reviewer = Math.min(
    MAX_REVIEWER_WIDTH,
    Math.max(8, ...issues.map((i) => i.reviewer.length)),
  )
  const title = Math.min(
    MAX_TITLE_WIDTH,
    Math.max(20, ...issues.map((i) => i.title.length)),
  )
  return { reviewer, title }
}

export function formatIssueRow(issue: ReviewIssue, widths: IssueColumnWidths): string {
  const marker = actionableMarker(issue)
  const sev = severityTag(issue.severity)
  // `fitCell` pads/truncates to keep columns aligned, so do that first
  // then escape blessed tag chars so LLM-authored titles/reviewer names
  // can't hijack the formatting with a stray `{...}`.
  const reviewer = escapeTags(fitCell(issue.reviewer, widths.reviewer))
  const title = escapeTags(fitCell(issue.title, widths.title))
  const where = issue.file
    ? `{gray-fg}${escapeTags(issue.file)}${issue.line ? `:${issue.line}` : ""}{/gray-fg}`
    : ""
  return `${marker} ${sev} ${reviewer} ${title} ${where}`
}

/**
 * Coloured dot prefix that mirrors the sidebar's verdict palette:
 *   actionable → green · deferred → yellow · dismissed → gray.
 * Untriaged issues get a blank so the severity column stays aligned.
 */
function actionableMarker(issue: ReviewIssue): string {
  switch (issue.triage?.verdict) {
    case "actionable":
      return `{${DASH_COLORS.ok}-fg}●{/${DASH_COLORS.ok}-fg}`
    case "deferred":
      return `{${DASH_COLORS.warn}-fg}●{/${DASH_COLORS.warn}-fg}`
    case "dismissed":
      return `{gray-fg}●{/gray-fg}`
    default:
      return " "
  }
}

function fitCell(value: string, width: number): string {
  if (value.length > width) return value.slice(0, Math.max(0, width - 1)) + "…"
  return value.padEnd(width)
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
