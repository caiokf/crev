import blessed from "../blessed-widgets-shim.js"
import type { Widgets } from "blessed"
import fs from "node:fs"
import path from "node:path"
import type { RuntimeHealth } from "@caiokf/valet"
import { doctorAction, type DoctorSnapshot, type SkillCheck } from "../../actions/doctor.js"
import { sanitizeDetail, sanitizeVersion } from "../../util/sanitize.js"
import { writeSkill, getInstalledSkills } from "../../util/skills.js"
import { writeIfNew } from "../../util/paths.js"
import { configTemplate } from "../../templates/config.js"
import type { ProjectCheck, SchemaReadiness } from "../../core/health.js"
import { runDashEffect } from "../runtime.js"
import { LIST_STYLE, BOX_STYLE, DASH_COLORS, escapeTags } from "../theme.js"
import type { AppContext, DashView } from "../types.js"

/**
 * A fix action that can be applied to a doctor row.
 * When `apply` is called, it performs the fix and returns a
 * human-readable result message.
 */
export type DoctorFixAction = {
  readonly label: string
  readonly apply: () => string
}

/**
 * Represents one row in the doctor list. Some rows are section headers,
 * some are detail/sub-item rows. Only rows with a `fix` property are
 * fixable via [f].
 */
export type DoctorRow = {
  readonly text: string
  readonly fix?: DoctorFixAction
}

/**
 * Doctor view — mirrors the `crev doctor` CLI report inside the dash.
 * Shows runtimes (installed / version / auth), schema readiness,
 * project-dir checks, and skill freshness. Rows are navigable and
 * fixable items can be repaired with [f].
 */
export function createDoctorView(): DashView {
  let outer: Widgets.BoxElement | null = null
  let list: Widgets.ListElement | null = null
  let rows: DoctorRow[] = []
  let snapshot: DoctorSnapshot | null = null

  return {
    route: { kind: "doctor" },
    mount(ctx: AppContext) {
      outer = blessed.box({
        parent: ctx.body,
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        label: " doctor ",
        border: "line",
        style: BOX_STYLE,
      })

      list = blessed.list({
        parent: outer,
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        keys: true,
        vi: true,
        mouse: true,
        tags: true,
        invertSelected: false,
        items: ["  {gray-fg}checking runtimes…{/gray-fg}"],
        style: LIST_STYLE,
        padding: { left: 1, right: 1, top: 0, bottom: 0 },
      } as Parameters<typeof blessed.list>[0])
      list.focus()
      ctx.setStatus("[↑/↓] or [j/k] move · [bksp] back · [q] quit")
      ctx.screen.render()

      list.key("f", () => {
        if (!list || rows.length === 0) return
        const selected = (list as unknown as { selected?: number }).selected ?? 0
        const row = rows[selected]
        if (!row?.fix) {
          ctx.setStatus(`{${DASH_COLORS.warn}-fg}nothing to fix on this row{/${DASH_COLORS.warn}-fg}`)
          ctx.screen.render()
          return
        }
        try {
          const result = row.fix.apply()
          // Reload the view after applying the fix
          if (snapshot) {
            reloadSnapshot(ctx, snapshot)
          }
          ctx.setStatus(`{${DASH_COLORS.ok}-fg}✓ ${result}{/${DASH_COLORS.ok}-fg}`)
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          ctx.setStatus(`{${DASH_COLORS.danger}-fg}fix failed: ${msg}{/${DASH_COLORS.danger}-fg}`)
        }
        ctx.screen.render()
      })

      const reloadSnapshot = (ctx: AppContext, snap: DoctorSnapshot) => {
        // Re-run doctor to get fresh state after a fix
        void runDashEffect(
          doctorAction({
            onRuntimeProgress: (checked, total) => {
              ctx.setStatus(`{gray-fg}rechecking… ${checked}/${total}{/gray-fg}`)
              ctx.screen.render()
            },
          }),
        ).then((result) => {
          if (!list) return
          if (result.kind === "error") return
          snapshot = result.value
          const prevSelected = (list as unknown as { selected?: number }).selected ?? 0
          rows = buildDoctorRows(result.value)
          list.setItems(rows.map((r) => r.text))
          if (prevSelected < rows.length) list.select(prevSelected)
          updateStatus(ctx)
          ctx.screen.render()
        })
      }

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
        if (!list) return
        if (result.kind === "error") {
          list.setItems([`  {red-fg}error:{/red-fg} ${result.message}`])
          ctx.setStatus("[↑/↓] or [j/k] move · [bksp] back · [q] quit")
          ctx.screen.render()
          return
        }
        snapshot = result.value
        rows = buildDoctorRows(result.value)
        list.setItems(rows.map((r) => r.text))
        updateStatus(ctx)
        ctx.screen.render()
      })
    },
    unmount() {
      list?.destroy()
      outer?.destroy()
      list = null
      outer = null
      rows = []
      snapshot = null
    },
  }

  function updateStatus(ctx: AppContext) {
    const hasFixable = rows.some((r) => r.fix)
    const fixHint = hasFixable ? " · [f] fix" : ""
    ctx.setStatus(`[↑/↓] or [j/k] move${fixHint} · [bksp] back · [q] quit`)
  }
}

// ── Row builders ──

export function buildDoctorRows(snap: DoctorSnapshot): DoctorRow[] {
  const rows: DoctorRow[] = []
  rows.push(...buildRuntimeRows(snap.runtimes))
  if (snap.schemaReadiness.length > 0) {
    rows.push({ text: "" }) // spacer
    rows.push(...buildSchemaRows(snap.schemaReadiness))
  }
  rows.push({ text: "" }) // spacer
  rows.push(...buildProjectRows(snap.projectChecks, snap.crevDir))
  if (snap.skills.length > 0) {
    rows.push({ text: "" }) // spacer
    rows.push(...buildSkillRows(snap.skills, snap.crevDir))
  }
  const hints = buildAuthHintRows(snap.runtimes)
  if (hints.length > 0) {
    rows.push({ text: "" }) // spacer
    rows.push(...hints)
  }
  return rows
}

function buildRuntimeRows(runtimes: readonly RuntimeHealth[]): DoctorRow[] {
  const rows: DoctorRow[] = []
  rows.push({ text: sectionHeader("runtimes") })
  if (runtimes.length === 0) {
    rows.push({ text: `  {gray-fg}no runtimes to check (no schemas found){/gray-fg}` })
    return rows
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
    rows.push({ text: `  ${namePadded}  ${padTagged(installed, 13)}  ${version}  ${auth}` })
  }

  return rows
}

function buildSchemaRows(readiness: readonly SchemaReadiness[]): DoctorRow[] {
  const rows: DoctorRow[] = []
  rows.push({ text: sectionHeader("schemas") })
  const width = Math.max(8, ...readiness.map((s) => s.name.length))
  for (const schema of readiness) {
    const name = escapeTags(schema.name).padEnd(width)
    if (schema.ready) {
      rows.push({ text: `  ${name}  {${DASH_COLORS.ok}-fg}✓ ready{/${DASH_COLORS.ok}-fg}` })
    } else {
      rows.push({
        text: `  ${name}  {${DASH_COLORS.danger}-fg}✗ not ready{/${DASH_COLORS.danger}-fg}`,
      })
      for (const issue of schema.issues) {
        rows.push({ text: `    {gray-fg}${escapeTags(issue)}{/gray-fg}` })
      }
    }
  }
  return rows
}

function buildProjectRows(checks: readonly ProjectCheck[], crevDir: string): DoctorRow[] {
  const rows: DoctorRow[] = []
  rows.push({ text: sectionHeader("project setup") })
  const width = Math.max(8, ...checks.map((c) => c.name.length))
  for (const check of checks) {
    const name = escapeTags(check.name).padEnd(width)
    const icon = check.ok
      ? `{${DASH_COLORS.ok}-fg}✓{/${DASH_COLORS.ok}-fg}`
      : `{${DASH_COLORS.danger}-fg}✗{/${DASH_COLORS.danger}-fg}`
    const text = `  ${name}  ${icon} {gray-fg}${escapeTags(check.detail)}{/gray-fg}`

    if (check.ok) {
      rows.push({ text })
      continue
    }

    // Attach fix actions for project setup issues
    const fix = getProjectFix(check, crevDir)
    rows.push({ text, fix })
  }
  return rows
}

function getProjectFix(check: ProjectCheck, crevDir: string): DoctorFixAction | undefined {
  const projectRoot = path.dirname(crevDir)

  if (check.name === ".crev/config.yaml" && !check.ok) {
    return {
      label: "create config.yaml",
      apply: () => {
        const configPath = path.join(crevDir, "config.yaml")
        writeIfNew(configPath, configTemplate)
        return "created .crev/config.yaml"
      },
    }
  }

  if (check.name === ".crev/schemas/" && !check.ok) {
    return {
      label: "create schemas directory",
      apply: () => {
        fs.mkdirSync(path.join(crevDir, "schemas"), { recursive: true })
        return "created .crev/schemas/"
      },
    }
  }

  if (check.name === ".crev/reviews/" && !check.ok) {
    return {
      label: "create reviews directory",
      apply: () => {
        fs.mkdirSync(path.join(crevDir, "reviews"), { recursive: true })
        return "created .crev/reviews/"
      },
    }
  }

  return undefined
}

function buildSkillRows(skills: readonly SkillCheck[], crevDir: string): DoctorRow[] {
  const projectRoot = path.dirname(crevDir)
  const rows: DoctorRow[] = []
  rows.push({ text: sectionHeader("skills") })
  const width = Math.max(8, ...skills.map((s) => s.tool.length))
  for (const skill of skills) {
    const name = escapeTags(skill.tool).padEnd(width)
    if (skill.upToDate) {
      rows.push({ text: `  ${name}  {${DASH_COLORS.ok}-fg}✓ up to date{/${DASH_COLORS.ok}-fg}` })
    } else {
      rows.push({
        text: `  ${name}  {${DASH_COLORS.warn}-fg}⚠ outdated{/${DASH_COLORS.warn}-fg} {gray-fg}run \`crev update\`{/gray-fg}`,
        fix: {
          label: `update ${skill.tool} skill`,
          apply: () => {
            const installed = getInstalledSkills(projectRoot)
            const tool = installed.find((t) => t.id === skill.id)
            if (!tool) return `could not find tool ${skill.tool}`
            writeSkill(projectRoot, tool, true)
            return `updated ${skill.tool} skill`
          },
        },
      })
    }
  }
  return rows
}

function buildAuthHintRows(runtimes: readonly RuntimeHealth[]): DoctorRow[] {
  const broken = runtimes.filter((h) => h.authenticated === "no" && h.authDetail)
  if (broken.length === 0) return []
  const rows: DoctorRow[] = []
  for (const rt of broken) {
    rows.push({
      text: `  {${DASH_COLORS.warn}-fg}⚠{/${DASH_COLORS.warn}-fg} fix ${escapeTags(rt.name)}: {gray-fg}${escapeTags(sanitizeDetail(rt.authDetail))}{/gray-fg}`,
    })
  }
  return rows
}

// ── Render (for tests / backward compat) ──

/**
 * Render the full doctor report as a single blessed-tagged string.
 * Used by tests. The dash view now uses buildDoctorRows() instead.
 */
export function renderDoctor(snapshot: DoctorSnapshot): string {
  const rows = buildDoctorRows(snapshot)
  return rows.map((r) => r.text).join("\n")
}

// ── Utilities ──

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
