import blessed from "blessed"
import path from "node:path"
import { showSchemaAction, type SchemaDetail } from "../../actions/schema.js"
import { runDashEffect } from "../runtime.js"
import { BOX_STYLE } from "../theme.js"
import type { AppContext, DashView } from "../types.js"

/**
 * Schema detail view. Loads a single schema and renders its
 * description, resolved file path, and reviewer list. Errors from
 * parsing/validation are shown inline instead of throwing — users
 * need to see the error message to fix the schema.
 */
export function createSchemaDetailView(name: string): DashView {
  let box: blessed.Widgets.BoxElement | null = null

  return {
    route: { kind: "schema-detail", name },
    mount(ctx: AppContext) {
      box = blessed.box({
        parent: ctx.body,
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        label: ` Schema · ${name} `,
        border: "line",
        tags: true,
        keys: true,
        scrollable: true,
        alwaysScroll: true,
        mouse: true,
        padding: { left: 2, right: 2, top: 1, bottom: 1 },
        content: "loading…",
        style: BOX_STYLE,
      })
      box.focus()
      ctx.setStatus("↑/↓ scroll · backspace back · q quit")
      ctx.screen.render()

      void runDashEffect(showSchemaAction(name)).then((result) => {
        if (!box) return
        if (result.kind === "error") {
          box.setContent(`{red-fg}error:{/red-fg} ${result.message}`)
        } else {
          box.setContent(renderSchema(result.value, ctx.crevDir))
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

export function renderSchema(detail: SchemaDetail, crevDir: string): string {
  const lines: string[] = []
  const relPath = path.relative(crevDir, detail.path) || detail.path

  lines.push(`{bold}${detail.name}{/bold}`)
  if (detail.description) {
    lines.push(`{gray-fg}${detail.description}{/gray-fg}`)
  }
  lines.push(`{gray-fg}source: ${relPath}{/gray-fg}`)
  lines.push("")

  lines.push(`{bold}Reviewers{/bold} (${detail.reviewers.length})`)
  for (const r of detail.reviewers) {
    const source = r.agent
      ? ` {gray-fg}→ ${r.agent}{/gray-fg}`
      : r.prompt
        ? " {gray-fg}(inline prompt){/gray-fg}"
        : ""
    lines.push(`  {cyan-fg}${r.name}{/cyan-fg} {gray-fg}${r.runtime}/${r.model}{/gray-fg}${source}`)
  }

  if (detail.triage) {
    lines.push("")
    lines.push(`{bold}Triage{/bold}`)
    lines.push(`  enabled: ${detail.triage.enabled ? "{green-fg}yes{/green-fg}" : "{gray-fg}no{/gray-fg}"}`)
    if (detail.triage.enabled) {
      lines.push(`  runtime: ${detail.triage.runtime}/${detail.triage.model}`)
    }
  }

  return lines.join("\n")
}
