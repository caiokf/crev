import blessed from "blessed"
import { BOX_STYLE } from "../theme.js"
import type { AppContext, DashRoute, DashView } from "../types.js"

/**
 * Placeholder view used for routes whose real implementation lives in
 * a later task (schemas list, run detail, wizard, …). Shows a short
 * message and a back-hint so the router + navigation wiring can be
 * exercised end-to-end today.
 */

export function createPlaceholderView(route: DashRoute, title: string, body: string): DashView {
  let box: blessed.Widgets.BoxElement | null = null

  return {
    route,
    mount(ctx: AppContext) {
      box = blessed.box({
        parent: ctx.body,
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        label: ` ${title} `,
        border: "line",
        padding: { left: 2, right: 2, top: 1, bottom: 1 },
        tags: true,
        content: body,
        keys: true,
        style: BOX_STYLE,
      })
      box.focus()
      ctx.setStatus("backspace/esc back · q quit")
      ctx.screen.render()
    },
    unmount() {
      box?.destroy()
      box = null
    },
  }
}
