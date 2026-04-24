import blessed from "../blessed-widgets-shim.js"
import type { Widgets } from "blessed"
import type { RuntimeHealth } from "@caiokf/valet"
import { doctorAction, type DoctorSnapshot, type SkillCheck } from "../../actions/doctor.js"
import { sanitizeDetail, sanitizeVersion } from "../../util/sanitize.js"
import type { ProjectCheck, SchemaReadiness } from "../../core/health.js"
import { runDashEffect } from "../runtime.js"
import { BOX_STYLE, DASH_COLORS, escapeTags } from "../theme.js"
import type { AppContext, DashView } from "../types.js"

/**
 * Doctor view — mirrors the `crev doctor` CLI report inside the dash.
 * Shows runtimes (installed / version / auth), schema readiness,
 * project-dir checks, and skill freshness. Runtime health checks
 * shell out in parallel and stream progress into the status line so
 * the UI doesn't look frozen while they run.
 *
 * `--ping` lives only on the CLI for now — it needs the live
 * RuntimeExec service, and the dash is for read-only inspection.
 */
export function createDoctorView(): DashView {
  let box: Widgets.BoxElement | null = null

  return {
    route: { kind: "doctor" },
    mount(ctx: AppContext) {
      box = blessed.box({
        parent: ctx.body,
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        label: " doctor ",
        border: "line",
        tags: true,
        keys: true,
        vi: true,
        mouse: true,
        scrollable: true,
        alwaysScroll: true,
        padding: { left: 2, right: 2, top: 1, bottom: 1 },
        content: "{gray-fg}checking runtimes…{/gray-fg}",
        style: BOX_STYLE,
      })
      box.focus()
      ctx.setStatus("[↑/↓] or [j/k] scroll · [bksp] back · [q] quit")
      ctx.screen.render()

      void runDashEffect(
        doctorAction({
          onRuntimeProgress: (checked, total) => {
            ctx.setStatus(
              `{gray-fg}checking runtimes… ${checked}/${total}{/gray-fg}`,
            )
            ctx.screen.render()
          },
        }),
      ).then((result) => {
        if (!box) return
        if (result.kind === "error") {
          box.setContent(`{red-fg}error:{/red-fg} ${result.message}`)
          ctx.setStatus("[↑/↓] or [j/k] scroll · [bksp] back · [q] quit")
          ctx.screen.render()
          return
        }
        box.setContent(renderDoctor(result.value))
        ctx.setStatus("[↑/↓] or [j/k] scroll · [bksp] back · [q] quit")
        ctx.screen.render()
      })
    },
    unmount() {
      box?.destroy()
      box = null
    },
  }
}

/**
 * Render the full doctor report as a single blessed-tagged string.
 * Layout mirrors the CLI `crev doctor` sections in the same order so
 * CLI-muscle-memory users find things where they expect.
 */
export function renderDoctor(snapshot: DoctorSnapshot): string {
  const sections: string[] = []
  sections.push(renderRuntimes(snapshot.runtimes))
  if (snapshot.schemaReadiness.length > 0) {
    sections.push(renderSchemas(snapshot.schemaReadiness))
  }
  sections.push(renderProject(snapshot.projectChecks))
  if (snapshot.skills.length > 0) {
    sections.push(renderSkills(snapshot.skills))
  }
  const hints = renderAuthHints(snapshot.runtimes)
  if (hints) sections.push(hints)
  return sections.join("\n\n")
}

function renderRuntimes(runtimes: readonly RuntimeHealth[]): string {
  const lines: string[] = []
  lines.push(sectionHeader("runtimes"))
  if (runtimes.length === 0) {
    lines.push(`  {gray-fg}no runtimes to check (no schemas found){/gray-fg}`)
    return lines.join("\n")
  }

  const nameWidth = Math.max(8, ...runtimes.map((h) => h.name.length))
  const versionWidth = 10

  for (const health of runtimes) {
    const name = `{${DASH_COLORS.accent}-fg}${escapeTags(health.name)}{/${DASH_COLORS.accent}-fg}`
    const namePadded = padTagged(name, nameWidth)
    const installed = health.installed
      ? `{${DASH_COLORS.ok}-fg}✓ installed{/${DASH_COLORS.ok}-fg}`
      : `{${DASH_COLORS.danger}-fg}✗ not found{/${DASH_COLORS.danger}-fg}`
    const versionRaw = health.installed ? sanitizeVersion(health.version) : ""
    const version = `{gray-fg}${escapeTags(versionRaw).padEnd(versionWidth)}{/gray-fg}`
    const auth =
      health.authenticated === "yes"
        ? `{${DASH_COLORS.ok}-fg}✓ auth'd{/${DASH_COLORS.ok}-fg}`
        : health.authenticated === "no"
          ? `{${DASH_COLORS.danger}-fg}✗ no auth{/${DASH_COLORS.danger}-fg}`
          : `{${DASH_COLORS.warn}-fg}? unknown{/${DASH_COLORS.warn}-fg}`
    lines.push(`  ${namePadded}  ${padTagged(installed, 13)}  ${version}  ${auth}`)
  }

  return lines.join("\n")
}

function renderSchemas(readiness: readonly SchemaReadiness[]): string {
  const lines: string[] = []
  lines.push(sectionHeader("schemas"))
  const width = Math.max(8, ...readiness.map((s) => s.name.length))
  for (const schema of readiness) {
    const name = escapeTags(schema.name).padEnd(width)
    if (schema.ready) {
      lines.push(`  ${name}  {${DASH_COLORS.ok}-fg}✓ ready{/${DASH_COLORS.ok}-fg}`)
    } else {
      lines.push(
        `  ${name}  {${DASH_COLORS.danger}-fg}✗ not ready{/${DASH_COLORS.danger}-fg}`,
      )
      for (const issue of schema.issues) {
        lines.push(`    {gray-fg}${escapeTags(issue)}{/gray-fg}`)
      }
    }
  }
  return lines.join("\n")
}

function renderProject(checks: readonly ProjectCheck[]): string {
  const lines: string[] = []
  lines.push(sectionHeader("project setup"))
  const width = Math.max(8, ...checks.map((c) => c.name.length))
  for (const check of checks) {
    const name = escapeTags(check.name).padEnd(width)
    const icon = check.ok
      ? `{${DASH_COLORS.ok}-fg}✓{/${DASH_COLORS.ok}-fg}`
      : `{${DASH_COLORS.danger}-fg}✗{/${DASH_COLORS.danger}-fg}`
    lines.push(`  ${name}  ${icon} {gray-fg}${escapeTags(check.detail)}{/gray-fg}`)
  }
  return lines.join("\n")
}

function renderSkills(skills: readonly SkillCheck[]): string {
  const lines: string[] = []
  lines.push(sectionHeader("skills"))
  const width = Math.max(8, ...skills.map((s) => s.tool.length))
  for (const skill of skills) {
    const name = escapeTags(skill.tool).padEnd(width)
    if (skill.upToDate) {
      lines.push(`  ${name}  {${DASH_COLORS.ok}-fg}✓ up to date{/${DASH_COLORS.ok}-fg}`)
    } else {
      lines.push(
        `  ${name}  {${DASH_COLORS.warn}-fg}⚠ outdated{/${DASH_COLORS.warn}-fg} {gray-fg}run \`crev update\`{/gray-fg}`,
      )
    }
  }
  return lines.join("\n")
}

function renderAuthHints(runtimes: readonly RuntimeHealth[]): string | null {
  const broken = runtimes.filter((h) => h.authenticated === "no" && h.authDetail)
  if (broken.length === 0) return null
  const lines: string[] = []
  for (const rt of broken) {
    lines.push(
      `  {${DASH_COLORS.warn}-fg}⚠{/${DASH_COLORS.warn}-fg} fix ${escapeTags(rt.name)}: {gray-fg}${escapeTags(sanitizeDetail(rt.authDetail))}{/gray-fg}`,
    )
  }
  return lines.join("\n")
}

function sectionHeader(label: string): string {
  return `{${DASH_COLORS.accent}-fg}{bold}❯ ${label}{/bold}{/${DASH_COLORS.accent}-fg}`
}

function visibleLength(tagged: string): number {
  return tagged.replace(/\{[^}]+\}/g, "").length
}

function padTagged(tagged: string, width: number): string {
  const padding = Math.max(0, width - visibleLength(tagged))
  return tagged + " ".repeat(padding)
}
