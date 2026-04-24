import blessed from "blessed"
import path from "node:path"
import { listReviewsAction, type ReviewSummary } from "../../actions/show.js"
import { runDashEffect } from "../runtime.js"
import { LIST_STYLE } from "../theme.js"
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
  let list: blessed.Widgets.ListElement | null = null
  let filterInput: blessed.Widgets.TextboxElement | null = null
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
        label: " Runs ",
        border: "line",
        keys: true,
        mouse: true,
        tags: true,
        items: ["  loading…"],
        style: LIST_STYLE,
      })
      list.focus()
      ctx.setStatus("↑/↓ move · enter open · / filter · backspace back · q quit")
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
          list.setItems(visibleRows.map(formatRow))
        }
        list.setLabel(filter ? ` Runs · filter: ${filter} ` : " Runs ")
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
        ctx.setStatus("type to filter · enter apply · esc cancel")
        ctx.screen.render()

        const closeInput = (apply: boolean) => {
          if (!filterInput) return
          if (apply) filter = filterInput.getValue().trim()
          filterInput.destroy()
          filterInput = null
          list?.focus()
          ctx.setStatus("↑/↓ move · enter open · / filter · backspace back · q quit")
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

export function formatRow(r: ReviewSummary): string {
  const when = r.timestamp.slice(0, 16).replace("T", " ")
  const slug = r.slug.slice(0, 30).padEnd(30)
  const schema = r.schema.padEnd(12)
  const issues = `${r.totalIssues} issue${r.totalIssues === 1 ? "" : "s"}`.padEnd(12)
  const file = `{gray-fg}${path.basename(r.filePath)}{/gray-fg}`
  return `  ${when}  ${slug}${schema}${issues}${file}`
}
