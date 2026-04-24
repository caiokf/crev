import blessed from "blessed"
import path from "node:path"
import { listReviewsAction, type ReviewSummary } from "../../actions/show.js"
import { runDashEffect } from "../runtime.js"
import { LIST_STYLE } from "../theme.js"
import type { AppContext, DashView } from "../types.js"

/**
 * Runs list view. Renders every review artefact found under the
 * configured output dir, newest first. Selecting a row drills into
 * the run detail view (keyed by slug; detail view re-resolves the
 * exact file via its index to avoid passing paths around).
 */
export function createRunsListView(): DashView {
  let list: blessed.Widgets.ListElement | null = null
  let rows: ReviewSummary[] = []

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
      ctx.setStatus("↑/↓ move · enter open · backspace back · q quit")
      ctx.screen.render()

      list.on("select", (_item, index) => {
        const row = rows[index]
        if (!row) return
        ctx.router.navigate({ kind: "run-detail", filePath: row.filePath })
      })

      void runDashEffect(listReviewsAction).then((result) => {
        if (!list) return
        if (result.kind === "error") {
          list.setItems([`  {red-fg}error:{/red-fg} ${result.message}`])
          ctx.screen.render()
          return
        }
        rows = result.value
        if (rows.length === 0) {
          list.setItems(["  {gray-fg}(no reviews yet — run `crev run --schema quick`){/gray-fg}"])
        } else {
          list.setItems(rows.map(formatRow))
        }
        ctx.screen.render()
      })
    },
    unmount() {
      list?.destroy()
      list = null
      rows = []
    },
  }
}

export function formatRow(r: ReviewSummary): string {
  const when = r.timestamp.slice(0, 16).replace("T", " ")
  const slug = r.slug.slice(0, 30).padEnd(30)
  const schema = r.schema.padEnd(12)
  const issues = `${r.totalIssues} issue${r.totalIssues === 1 ? "" : "s"}`.padEnd(12)
  const file = `{gray-fg}${path.basename(r.filePath)}{/gray-fg}`
  return `  ${when}  ${slug}${schema}${issues}${file}`
}
