import blessed from "../blessed-widgets-shim.js"
import type { Widgets } from "blessed"
import { listSchemasAction, type SchemaSummary } from "../../actions/list.js"
import { runDashEffect } from "../runtime.js"
import { DASH_COLORS, LIST_STYLE } from "../theme.js"
import type { AppContext, DashView } from "../types.js"

/**
 * Schemas list view. Fetches every discoverable schema via
 * `listSchemasAction` and renders a scrollable list. Selecting a row
 * navigates to the schema-detail view.
 *
 * Rows marked with an error (e.g. invalid YAML) stay selectable so
 * users can still drill in; the detail view will show the parse
 * failure instead of silently hiding it.
 */
export function createSchemasListView(): DashView {
  let list: Widgets.ListElement | null = null
  let rows: SchemaSummary[] = []

  return {
    route: { kind: "schemas" },
    mount(ctx: AppContext) {
      list = blessed.list({
        parent: ctx.body,
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        label: " schemas ",
        border: "line",
        keys: true,
        vi: true,
        mouse: true,
        tags: true,
        items: ["  loading…"],
        style: LIST_STYLE,
      })
      list.focus()
      ctx.setStatus("[↑/↓] or [j/k] move · [enter] open · [bksp] back · [q] quit")
      ctx.screen.render()

      list.on("select", (_item, index) => {
        const row = rows[index]
        if (!row) return
        ctx.router.navigate({ kind: "schema-detail", name: row.name })
      })

      void runDashEffect(listSchemasAction).then((result) => {
        if (!list) return // view already unmounted
        if (result.kind === "error") {
          list.setItems([`  {red-fg}error:{/red-fg} ${result.message}`])
          ctx.screen.render()
          return
        }
        rows = result.value
        if (rows.length === 0) {
          list.setItems(["  {gray-fg}(no schemas found — run `crev schema init <name>`){/gray-fg}"])
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

export function formatRow(s: SchemaSummary): string {
  const name = s.name.padEnd(24)
  const reviewers = `${s.reviewers} reviewer${s.reviewers === 1 ? "" : "s"}`.padEnd(14)
  const desc = s.error ? `{red-fg}${s.error}{/red-fg}` : s.description || "{gray-fg}(no description){/gray-fg}"
  return `  {${DASH_COLORS.accent}-fg}${name}{/${DASH_COLORS.accent}-fg}{gray-fg}${reviewers}{/gray-fg}${desc}`
}
