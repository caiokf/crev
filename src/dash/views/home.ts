import blessed from "../blessed-widgets-shim.js"
import type { Widgets } from "blessed"
import { statsAction, type StatsOutput } from "../../actions/stats.js"
import { runDashEffect } from "../runtime.js"
import { DASH_COLORS, LIST_STYLE, BOX_STYLE } from "../theme.js"
import type { AppContext, DashRoute, DashView } from "../types.js"

/**
 * Home view — top-level stats overview with a navigation menu below.
 *
 * The overview panel loads aggregate stats (runs, issues, severity,
 * triage, categories) asynchronously and renders them with bar charts
 * and colored indicators. The navigation menu gives quick access to
 * schemas, runs, and the run wizard.
 */

type HomeEntry = {
  /** Single-letter mnemonic shortcut. Must be unique across ENTRIES. */
  readonly key: string
  readonly label: string
  readonly hint: string
  readonly route: DashRoute
}

// Shortcut letters follow a mnemonic scheme so future entries drop
// in without reshuffling muscle memory:
//   s=schemas · r=runs · n=new review · t=sTats · d=doctor
// When adding new entries, pick a letter from the label that isn't
// already taken — avoid `q` (quit) and single-char keys used by the
// global shell (escape/backspace).
export const ENTRIES: ReadonlyArray<HomeEntry> = [
  { key: "s", label: "schemas", hint: "browse schemas and reviewers", route: { kind: "schemas" } },
  { key: "r", label: "runs", hint: "browse past review runs", route: { kind: "runs" } },
  { key: "n", label: "start a review", hint: "interactive run wizard", route: { kind: "run-wizard" } },
]

export function createHomeView(): DashView {
  let statsBox: Widgets.BoxElement | null = null
  let list: Widgets.ListElement | null = null

  return {
    route: { kind: "home" },
    mount(ctx: AppContext) {
      const MENU_HEIGHT = 7

      statsBox = blessed.box({
        parent: ctx.body,
        top: 0,
        left: 0,
        right: 0,
        bottom: MENU_HEIGHT,
        label: " overview ",
        border: "line",
        tags: true,
        scrollable: true,
        alwaysScroll: true,
        padding: { left: 1, right: 1 },
        style: BOX_STYLE,
        content: "  {gray-fg}loading…{/gray-fg}",
      })

      list = blessed.list({
        parent: ctx.body,
        bottom: 0,
        left: 0,
        right: 0,
        height: MENU_HEIGHT,
        label: " crev dash ",
        border: "line",
        keys: true,
        vi: true,
        mouse: true,
        tags: true,
        items: ENTRIES.map(
          (e) =>
            `  {gray-fg}[{/gray-fg}{${DASH_COLORS.accent}-fg}{bold}${e.key}{/bold}{/${DASH_COLORS.accent}-fg}{gray-fg}]{/gray-fg} ` +
            `{${DASH_COLORS.accent}-fg}${e.label.padEnd(18)}{/${DASH_COLORS.accent}-fg} {gray-fg}${e.hint}{/gray-fg}`,
        ),
        style: LIST_STYLE,
      })

      list.on("select", (_item, index) => {
        const entry = ENTRIES[index]
        if (entry) ctx.router.navigate(entry.route)
      })

      for (const entry of ENTRIES) {
        list.key(entry.key, () => ctx.router.navigate(entry.route))
      }

      list.focus()
      const shortcuts = ENTRIES.map((e) => `[${e.key}] ${e.label.split(" ")[0]}`).join(" · ")
      ctx.setStatus(`[↑/↓] or [j/k] move · [enter] open · ${shortcuts} · [q] quit`)
      ctx.screen.render()

      void runDashEffect(statsAction({})).then((result) => {
        if (!statsBox) return
        if (result.kind === "error") {
          statsBox.setContent(`  {red-fg}error:{/red-fg} ${result.message}`)
          ctx.screen.render()
          return
        }
        statsBox.setContent(renderStats(result.value))
        ctx.screen.render()
      })
    },
    unmount() {
      list?.destroy()
      statsBox?.destroy()
      list = null
      statsBox = null
    },
  }
}

// ── Stats rendering ──────────────────────────────────────────────

type AggregatedStats = {
  totalRuns: number
  totalIssues: number
  schemas: number
  lastRun: string
  severity: Record<string, number>
  byCategory: Record<string, number>
  actionable: number
  deferred: number
  dismissed: number
  untriaged: number
  hasTriage: boolean
}

function aggregateStats(stats: StatsOutput): AggregatedStats {
  let totalIssues = 0
  let actionable = 0
  let deferred = 0
  let dismissed = 0
  let untriaged = 0
  const severity: Record<string, number> = {}
  const byCategory: Record<string, number> = {}
  let lastRun = ""
  let hasTriage = false
  let schemas = 0

  for (const schema of Object.values(stats.bySchema)) {
    schemas++
    for (const rev of schema.revisions) {
      if (rev.hasTriage) hasTriage = true
      if (rev.lastDate > lastRun) lastRun = rev.lastDate
      for (const rs of rev.reviewerStats) {
        totalIssues += rs.totalIssues
        actionable += rs.actionable
        deferred += rs.deferred
        dismissed += rs.dismissed
        untriaged += rs.untriaged
        for (const [sev, count] of Object.entries(rs.bySeverity)) {
          severity[sev] = (severity[sev] ?? 0) + count
        }
        for (const [cat, count] of Object.entries(rs.byCategory)) {
          byCategory[cat] = (byCategory[cat] ?? 0) + count
        }
      }
    }
  }

  return {
    totalRuns: stats.totalLoaded,
    totalIssues,
    schemas,
    lastRun,
    severity,
    byCategory,
    actionable,
    deferred,
    dismissed,
    untriaged,
    hasTriage,
  }
}

export function renderStats(stats: StatsOutput): string {
  const agg = aggregateStats(stats)

  if (agg.totalRuns === 0) {
    return "\n{gray-fg}no reviews yet — run {bold}crev run --schema <name>{/bold} to get started{/gray-fg}"
  }

  const lines: string[] = []

  // ── Summary counters ──
  const issueColor =
    agg.totalIssues === 0
      ? DASH_COLORS.ok
      : agg.totalIssues >= 50
        ? DASH_COLORS.danger
        : DASH_COLORS.warn
  const lastRunText = agg.lastRun ? formatRelativeDate(agg.lastRun) : ""

  lines.push("")
  lines.push(
    ` {bold}{white-fg}${agg.totalRuns}{/white-fg}{/bold} runs    ` +
      `{bold}{${issueColor}-fg}${agg.totalIssues}{/${issueColor}-fg}{/bold} issues    ` +
      `{bold}{white-fg}${agg.schemas}{/white-fg}{/bold} schema${agg.schemas === 1 ? "" : "s"}` +
      (lastRunText ? `    {gray-fg}last run ${lastRunText}{/gray-fg}` : ""),
  )
  lines.push("")

  // ── Severity bars + triage dots (side by side) ──
  const sevLines = buildSeverityLines(agg.severity)
  const triLines = agg.hasTriage ? buildTriageLines(agg) : []

  const COL_WIDTH = 32
  const maxRows = Math.max(sevLines.length, triLines.length)
  for (let i = 0; i < maxRows; i++) {
    const left = sevLines[i] ?? ""
    const right = triLines[i] ?? ""
    lines.push(` ${padTagged(left, COL_WIDTH)}${right}`)
  }

  // ── Category breakdown (inline) ──
  const cats = Object.entries(agg.byCategory).sort(([, a], [, b]) => b - a)
  if (cats.length > 0) {
    lines.push("")
    lines.push(
      ` {bold}by category{/bold}  ` +
        cats
          .map(
            ([cat, count]) =>
              `{${DASH_COLORS.accent}-fg}${cat}{/${DASH_COLORS.accent}-fg} ${count}`,
          )
          .join("  ·  "),
    )
  }

  return lines.join("\n")
}

function buildSeverityLines(severity: Record<string, number>): string[] {
  const out: string[] = ["{bold}by severity{/bold}"]
  const order = ["critical", "high", "medium", "low"] as const
  const maxCount = Math.max(...order.map((s) => severity[s] ?? 0), 1)
  const barMax = 16

  for (const sev of order) {
    const count = severity[sev] ?? 0
    if (count === 0) continue
    const barLen = Math.max(1, Math.round((count / maxCount) * barMax))
    const bar = "█".repeat(barLen)
    const color =
      sev === "critical" || sev === "high"
        ? DASH_COLORS.danger
        : sev === "medium"
          ? DASH_COLORS.warn
          : DASH_COLORS.muted
    const label = sev === "critical" ? "crit" : sev
    out.push(
      `{${color}-fg}${bar}{/${color}-fg} ${String(count).padStart(3)} ${label}`,
    )
  }

  if (out.length === 1) out.push("{gray-fg}(none){/gray-fg}")
  return out
}

function buildTriageLines(agg: AggregatedStats): string[] {
  const out: string[] = ["{bold}triage{/bold}"]
  if (agg.actionable > 0)
    out.push(
      `{${DASH_COLORS.ok}-fg}●{/${DASH_COLORS.ok}-fg} ${String(agg.actionable).padStart(3)} actionable`,
    )
  if (agg.deferred > 0)
    out.push(
      `{${DASH_COLORS.warn}-fg}●{/${DASH_COLORS.warn}-fg} ${String(agg.deferred).padStart(3)} deferred`,
    )
  if (agg.dismissed > 0)
    out.push(`{gray-fg}●{/gray-fg} ${String(agg.dismissed).padStart(3)} dismissed`)
  if (agg.untriaged > 0)
    out.push(
      `{white-fg}○{/white-fg} ${String(agg.untriaged).padStart(3)} untriaged`,
    )
  return out
}

// ── Helpers ──────────────────────────────────────────────────────

function visibleLength(tagged: string): number {
  return tagged.replace(/\{[^}]+\}/g, "").length
}

function padTagged(tagged: string, width: number): string {
  const padding = Math.max(0, width - visibleLength(tagged))
  return tagged + " ".repeat(padding)
}

function formatRelativeDate(iso: string): string {
  const date = new Date(iso)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 1) return "just now"
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 30) return `${diffDays}d ago`
  return date.toLocaleDateString()
}
