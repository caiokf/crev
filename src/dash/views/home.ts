import blessed from "blessed"
import { DASH_COLORS, LIST_STYLE } from "../theme.js"
import type { AppContext, DashRoute, DashView } from "../types.js"

/**
 * Home view — a simple menu that routes to the real views once they
 * land in later tasks (#3 schemas, #8 runs, #4 run wizard).
 *
 * Kept intentionally small; it validates the router + app shell
 * without waiting for the detail-view work.
 */

type HomeEntry = {
  readonly label: string
  readonly hint: string
  readonly route: DashRoute
}

const ENTRIES: ReadonlyArray<HomeEntry> = [
  { label: "schemas", hint: "browse schemas and reviewers", route: { kind: "schemas" } },
  { label: "runs", hint: "browse past review runs", route: { kind: "runs" } },
  { label: "start a review", hint: "interactive run wizard", route: { kind: "run-wizard" } },
]

export function createHomeView(): DashView {
  let list: blessed.Widgets.ListElement | null = null

  return {
    route: { kind: "home" },
    mount(ctx: AppContext) {
      list = blessed.list({
        parent: ctx.body,
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        label: " crev dash ",
        border: "line",
        keys: true,
        vi: true,
        mouse: true,
        tags: true,
        items: ENTRIES.map(
          (e) => `  {${DASH_COLORS.accent}-fg}${e.label.padEnd(20)}{/${DASH_COLORS.accent}-fg} {gray-fg}${e.hint}{/gray-fg}`,
        ),
        style: LIST_STYLE,
      })

      list.on("select", (_item, index) => {
        const entry = ENTRIES[index]
        if (entry) ctx.router.navigate(entry.route)
      })

      list.focus()
      ctx.setStatus("↑/↓ or j/k move · enter open · q quit")
      ctx.screen.render()
    },
    unmount() {
      list?.destroy()
      list = null
    },
  }
}
