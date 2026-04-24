import blessed from "../blessed-widgets-shim.js"
import type { Widgets } from "blessed"
import path from "node:path"
import { listReviewsAction, type ReviewSummary } from "../../actions/show.js"
import { runDashEffect } from "../runtime.js"
import { DASH_COLORS, LIST_STYLE } from "../theme.js"
import type { AppContext, DashView } from "../types.js"

/**
 * Runs list view. Renders every review artefact found under the
 * configured output dir, newest first. Selecting a row drills into
 * the run detail view.
 *
 * `/` opens a filter textbox at the bottom of the view; typing
 * narrows the visible rows by matching slug/schema/description
 * substrings (case-insensitive). Escape/enter closes the filter and
 * returns focus to the list.
 */
export function createRunsListView(): DashView {
  let list: Widgets.ListElement | null = null
  let filterInput: Widgets.TextboxElement | null = null
  let allRows: ReviewSummary[] = []
  let visibleRows: ReviewSummary[] = []
  let filter = ""

  return {
    route: { kind: "runs" },
    mount(ctx: AppContext) {
      list = blessed.list({
        parent: ctx.body,
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        label: " runs ",
        border: "line",
        keys: true,
        vi: true,
        mouse: true,
        tags: true,
        items: ["  loading…"],
        style: LIST_STYLE,
      })
      list.focus()
      ctx.setStatus("[↑/↓] or [j/k] move · [enter] open · [/] filter · [bksp] back · [q] quit")
      ctx.screen.render()

      const renderRows = () => {
        if (!list) return
        visibleRows = filter
          ? allRows.filter((r) => matchesFilter(r, filter))
          : allRows
        if (visibleRows.length === 0) {
          list.setItems([
            filter
              ? `  {gray-fg}(no rows match "${filter}"){/gray-fg}`
              : "  {gray-fg}(no reviews yet — run `crev run --schema quick`){/gray-fg}",
          ])
        } else {
          const widths = computeColumnWidths(visibleRows)
          list.setItems(visibleRows.map((r) => formatRow(r, widths)))
        }
        list.setLabel(filter ? ` runs · filter: ${filter} ` : " runs ")
        ctx.screen.render()
      }

      list.on("select", (_item, index) => {
        const row = visibleRows[index]
        if (!row) return
        ctx.router.navigate({ kind: "run-detail", filePath: row.filePath })
      })

      list.key("/", () => {
        if (filterInput) return
        filterInput = blessed.textbox({
          parent: ctx.body,
          bottom: 0,
          left: 0,
          right: 0,
          height: 1,
          inputOnFocus: true,
          keys: true,
          mouse: true,
          style: { fg: "white", bg: "blue" },
        })
        filterInput.setValue(filter)
        filterInput.focus()
        ctx.setStatus("type to filter · [enter] apply · [esc] cancel")
        ctx.screen.render()

        const closeInput = (apply: boolean) => {
          if (!filterInput) return
          if (apply) filter = filterInput.getValue().trim()
          filterInput.destroy()
          filterInput = null
          list?.focus()
          ctx.setStatus("[↑/↓] or [j/k] move · [enter] open · [/] filter · [bksp] back · [q] quit")
          renderRows()
        }

        filterInput.key(["escape"], () => closeInput(false))
        filterInput.on("submit", () => closeInput(true))
      })

      void runDashEffect(listReviewsAction).then((result) => {
        if (!list) return
        if (result.kind === "error") {
          list.setItems([`  {red-fg}error:{/red-fg} ${result.message}`])
          ctx.screen.render()
          return
        }
        allRows = result.value
        renderRows()
      })
    },
    unmount() {
      filterInput?.destroy()
      filterInput = null
      list?.destroy()
      list = null
      allRows = []
      visibleRows = []
      filter = ""
    },
  }
}

export function matchesFilter(r: ReviewSummary, filter: string): boolean {
  const needle = filter.toLowerCase()
  return (
    r.slug.toLowerCase().includes(needle) ||
    r.schema.toLowerCase().includes(needle) ||
    (r.description ?? "").toLowerCase().includes(needle)
  )
}

export type ColumnWidths = {
  readonly slug: number
  readonly schema: number
  readonly issues: number
}

const MAX_SLUG_WIDTH = 30
const MAX_SCHEMA_WIDTH = 24
const ISSUES_WIDTH = 10

export function computeColumnWidths(rows: ReadonlyArray<ReviewSummary>): ColumnWidths {
  const slug = Math.min(
    MAX_SLUG_WIDTH,
    Math.max(4, ...rows.map((r) => r.slug.length)),
  )
  const schema = Math.min(
    MAX_SCHEMA_WIDTH,
    Math.max(6, ...rows.map((r) => r.schema.length)),
  )
  return { slug, schema, issues: ISSUES_WIDTH }
}

export function formatRow(r: ReviewSummary, widths: ColumnWidths): string {
  const when = r.timestamp.slice(0, 16).replace("T", " ")
  const slug = fitCell(r.slug, widths.slug)
  const schema = fitCell(r.schema, widths.schema)
  const issuesText = `${r.totalIssues} issue${r.totalIssues === 1 ? "" : "s"}`
  const issues = issuesText.padEnd(widths.issues)
  const file = path.basename(r.filePath)

  const issueColor =
    r.totalIssues === 0
      ? DASH_COLORS.ok
      : r.totalIssues >= 10
        ? DASH_COLORS.danger
        : DASH_COLORS.warn

  return (
    `  {gray-fg}${when}{/gray-fg}  ` +
    `${slug}  ` +
    `{${DASH_COLORS.accent}-fg}${schema}{/${DASH_COLORS.accent}-fg}  ` +
    `{${issueColor}-fg}${issues}{/${issueColor}-fg}  ` +
    `{gray-fg}${file}{/gray-fg}`
  )
}

function fitCell(value: string, width: number): string {
  if (value.length > width) return value.slice(0, Math.max(0, width - 1)) + "…"
  return value.padEnd(width)
}
