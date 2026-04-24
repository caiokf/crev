import blessed from "../blessed-widgets-shim.js"
import type { Widgets } from "blessed"
import { showAction } from "../../actions/show.js"
import { setVerdictAction } from "../../actions/verdict.js"
import { fixAction } from "../../actions/fix.js"
import { isFixConfigured } from "../../core/health.js"
import type { ReviewIssue, TriageVerdict } from "../../core/types.js"
import { copyToClipboard } from "../clipboard.js"
import {
  startFix,
  getFixState,
  updateFixProgress,
  completeFix,
  failFix,
  isBulkFixRunning,
  isIssueBeingFixed,
  formatElapsed,
} from "../fix-state.js"
import { runDashEffect } from "../runtime.js"
import { BOX_STYLE, DASH_COLORS, escapeTags } from "../theme.js"
import type { AppContext, DashView } from "../types.js"

/**
 * Issue detail view. Re-loads the parent review (same cost as the
 * run-detail view) and surfaces the selected issue's full body plus
 * its triage verdict + enrichment if present.
 *
 * Sections are laid out as colored/bold headers so the eye can skip
 * between "what's wrong", "triage verdict", "suggested fix", and
 * "prompt for ai agents". `[c]` copies the agent prompt (or, if
 * enrichment is missing, a fallback synthesized from the issue body)
 * to the system clipboard so the user can paste it into their coding
 * agent of choice.
 */
export function createIssueDetailView(filePath: string, issueId: string): DashView {
  let box: Widgets.BoxElement | null = null
  let currentIssue: ReviewIssue | null = null
  let fixTimer: ReturnType<typeof setInterval> | null = null
  let fixConfigured = false

  return {
    route: { kind: "issue-detail", filePath, issueId },
    mount(ctx: AppContext) {
      try { fixConfigured = isFixConfigured(ctx.crevDir) } catch { fixConfigured = false }
      box = blessed.box({
        parent: ctx.body,
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        label: " issue ",
        border: "line",
        tags: true,
        keys: true,
        vi: true,
        mouse: true,
        scrollable: true,
        alwaysScroll: true,
        padding: { left: 2, right: 2, top: 1, bottom: 1 },
        content: "loading…",
        style: BOX_STYLE,
      })
      box.focus()
      // `[a]/[d]/[x]` triage shortcuts are always bound; `[c]` and `[f]`
      // only appear in the statusline once we know enrichment exists.
      const triageHint = "[a]actionable [d]deferred [x]dismissed"
      const fixHint = fixConfigured ? " · [f] fix" : ""
      const baseStatus = `[↑/↓] or [j/k] scroll · ${triageHint}${fixHint} · [bksp] back · [q] quit`
      const statusWithCopy = `[↑/↓] or [j/k] scroll · [c] copy prompt${fixHint} · ${triageHint} · [bksp] back · [q] quit`
      ctx.setStatus(baseStatus)
      ctx.screen.render()

      const applyVerdict = (verdict: TriageVerdict["verdict"]): void => {
        if (!currentIssue) return
        const issueId = currentIssue.id
        ctx.setStatus(`{gray-fg}setting verdict → ${verdict}…{/gray-fg}`)
        ctx.screen.render()
        void runDashEffect(setVerdictAction({ filePath, issueId, verdict })).then((result) => {
          if (!box) return
          if (result.kind === "error") {
            ctx.setStatus(
              `{${DASH_COLORS.danger}-fg}verdict update failed: ${result.message}{/${DASH_COLORS.danger}-fg}`,
            )
            ctx.screen.render()
            return
          }
          currentIssue = result.value.issue
          box.setContent(renderIssue(result.value.issue))
          const verdictColor =
            verdict === "actionable"
              ? DASH_COLORS.ok
              : verdict === "deferred"
                ? DASH_COLORS.warn
                : "gray"
          ctx.setStatus(
            `{${verdictColor}-fg}✓ verdict → ${verdict}{/${verdictColor}-fg}`,
          )
          ctx.screen.render()
        })
      }

      box.key("a", () => applyVerdict("actionable"))
      box.key("d", () => applyVerdict("deferred"))
      box.key("x", () => applyVerdict("dismissed"))

      // `[c]` is only bound once we know the issue has an enrichment
      // prompt — hiding the shortcut otherwise keeps the status line
      // honest about what the user can actually do.
      box.key("c", () => {
        if (!currentIssue) return
        const prompt = buildCopyPrompt(currentIssue)
        if (!prompt) return
        void copyToClipboard(prompt)
          .then(() => {
            ctx.setStatus(`{${DASH_COLORS.ok}-fg}✓ copied prompt for ai agents to clipboard{/${DASH_COLORS.ok}-fg}`)
            ctx.screen.render()
          })
          .catch((err: unknown) => {
            const msg = err instanceof Error ? err.message : String(err)
            ctx.setStatus(`{${DASH_COLORS.danger}-fg}copy failed: ${msg}{/${DASH_COLORS.danger}-fg}`)
            ctx.screen.render()
          })
      })

      // ── [f] fix this issue ──
      if (fixConfigured) {
        box.key("f", () => {
          if (!currentIssue) return
          // Block if a bulk fix is running (conflicts with single-issue fixes)
          if (isBulkFixRunning(filePath)) {
            const state = getFixState(filePath)!
            ctx.setStatus(
              `{${DASH_COLORS.warn}-fg}bulk fix running (${state.runtime}/${state.model} · ${formatElapsed(state.startedAt)}){/${DASH_COLORS.warn}-fg}`,
            )
            ctx.screen.render()
            return
          }
          // Block if this specific issue is already being fixed
          if (isIssueBeingFixed(filePath, issueId)) {
            const state = getFixState(filePath, issueId)!
            ctx.setStatus(
              `{${DASH_COLORS.warn}-fg}already fixing this issue (${state.runtime}/${state.model} · ${formatElapsed(state.startedAt)}){/${DASH_COLORS.warn}-fg}`,
            )
            ctx.screen.render()
            return
          }
          if (!currentIssue.triage?.enrichment?.promptForAgents?.trim()) {
            ctx.setStatus(`{${DASH_COLORS.warn}-fg}no fix prompt available for this issue{/${DASH_COLORS.warn}-fg}`)
            ctx.screen.render()
            return
          }

          if (!startFix(filePath, { kind: "single", issueId }, "claude", "sonnet", 1)) return

          ctx.setStatus(
            `{${DASH_COLORS.accent}-fg}⟳ fixing issue…{/${DASH_COLORS.accent}-fg}`,
          )
          ctx.screen.render()

          fixTimer = setInterval(() => {
            const state = getFixState(filePath, issueId)
            if (!state || state.finishedAt) {
              if (fixTimer) { clearInterval(fixTimer); fixTimer = null }
              return
            }
            ctx.setStatus(
              `{${DASH_COLORS.accent}-fg}⟳ fixing (${state.runtime}/${state.model} · ${formatElapsed(state.startedAt)})…{/${DASH_COLORS.accent}-fg}`,
            )
            ctx.screen.render()
          }, 1000)

          void runDashEffect(
            fixAction({
              filePath,
              issueId,
              onProgress: (completed, total, status) => {
                updateFixProgress(filePath, completed, total, status, issueId)
              },
            }),
          ).then((result) => {
            if (fixTimer) { clearInterval(fixTimer); fixTimer = null }
            completeFix(filePath, issueId)
            if (!box) return
            if (result.kind === "error") {
              failFix(filePath, result.message, issueId)
              ctx.setStatus(
                `{${DASH_COLORS.danger}-fg}fix failed: ${result.message}{/${DASH_COLORS.danger}-fg}`,
              )
              ctx.screen.render()
              return
            }
            const status = result.value.statuses[0]
            if (status?.status === "fixed") {
              currentIssue = result.value.result.reviews
                .flatMap((r) => r.issues)
                .find((i) => i.id === issueId) ?? currentIssue
              if (currentIssue) box.setContent(renderIssue(currentIssue))
              ctx.setStatus(
                `{${DASH_COLORS.ok}-fg}✓ issue fixed{/${DASH_COLORS.ok}-fg}`,
              )
            } else {
              ctx.setStatus(
                `{${DASH_COLORS.warn}-fg}fix ${status?.status ?? "unknown"}: ${status?.reasoning ?? ""}{/${DASH_COLORS.warn}-fg}`,
              )
            }
            ctx.screen.render()
          })
        })

        // On re-mount, check if this specific issue is currently being fixed
        if (isIssueBeingFixed(filePath, issueId)) {
          const state = getFixState(filePath, issueId) ?? getFixState(filePath)!
          ctx.setStatus(
            `{${DASH_COLORS.accent}-fg}⟳ fixing (${state.runtime}/${state.model} · ${formatElapsed(state.startedAt)})…{/${DASH_COLORS.accent}-fg}`,
          )
          fixTimer = setInterval(() => {
            const s = getFixState(filePath, issueId) ?? getFixState(filePath)
            if (!s || s.finishedAt) {
              if (fixTimer) { clearInterval(fixTimer); fixTimer = null }
              return
            }
            ctx.setStatus(
              `{${DASH_COLORS.accent}-fg}⟳ fixing (${s.runtime}/${s.model} · ${formatElapsed(s.startedAt)})…{/${DASH_COLORS.accent}-fg}`,
            )
            ctx.screen.render()
          }, 1000)
        }
      }

      void runDashEffect(showAction({ filePath })).then((result) => {
        if (!box) return
        if (result.kind === "error") {
          box.setContent(`{red-fg}error:{/red-fg} ${result.message}`)
          ctx.screen.render()
          return
        }
        const issue = findIssue(result.value.result.reviews.flatMap((r) => r.issues), issueId)
        if (!issue) {
          box.setContent(`{${DASH_COLORS.warn}-fg}issue not found in review{/${DASH_COLORS.warn}-fg}`)
        } else {
          currentIssue = issue
          box.setContent(renderIssue(issue))
          if (buildCopyPrompt(issue)) ctx.setStatus(statusWithCopy)
        }
        ctx.screen.render()
      })
    },
    unmount() {
      if (fixTimer) { clearInterval(fixTimer); fixTimer = null }
      box?.destroy()
      box = null
      currentIssue = null
    },
  }
}

export function findIssue(issues: readonly ReviewIssue[], id: string): ReviewIssue | undefined {
  return issues.find((i) => i.id === id)
}

/**
 * Return the triage-enrichment prompt for AI agents verbatim, or the
 * empty string if the run didn't produce one. This is the exact same
 * field the PR-comment template (`triage.enrichment.promptForAgents`)
 * renders — we never synthesize a fallback here so the dash mirrors
 * what ends up in the PR.
 */
export function buildCopyPrompt(issue: ReviewIssue): string {
  return issue.triage?.enrichment?.promptForAgents?.trim() ?? ""
}

export function renderIssue(issue: ReviewIssue): string {
  const lines: string[] = []
  const sevColor = severityColor(issue.severity)
  const catColor = categoryColor(issue.category)

  // ── Title + severity/category pill row ──
  //   User-controlled strings (title, reviewer, description, …) are
  //   run through `escapeTags` because blessed otherwise interprets
  //   `{...}` inside them as color directives — which is how a
  //   description literally discussing `{cyan-fg}` tags ended up
  //   rendered entirely in blue.
  lines.push(`{bold}${escapeTags(issue.title)}{/bold}`)
  lines.push(
    `{${sevColor}-fg}{bold}${issue.severity.toUpperCase()}{/bold}{/${sevColor}-fg}` +
      `  {${catColor}-fg}${escapeTags(issue.category)}{/${catColor}-fg}` +
      `  {${DASH_COLORS.accent}-fg}${escapeTags(issue.reviewer)}{/${DASH_COLORS.accent}-fg}` +
      `  {gray-fg}${escapeTags(issue.runtime)}/${escapeTags(issue.model)}{/gray-fg}`,
  )
  if (issue.file) {
    lines.push(
      `{gray-fg}↳{/gray-fg} {${DASH_COLORS.accent}-fg}${escapeTags(issue.file)}${issue.line ? `:${issue.line}` : ""}{/${DASH_COLORS.accent}-fg}`,
    )
  }

  // ── Description ──
  lines.push("")
  lines.push(sectionHeader("description"))
  lines.push(escapeTags(issue.description))

  // ── Triage (if present) ──
  if (issue.triage) {
    const verdict = issue.triage.verdict
    const verdictColor =
      verdict === "actionable"
        ? DASH_COLORS.ok
        : verdict === "deferred"
          ? DASH_COLORS.warn
          : "gray"

    lines.push("")
    lines.push(sectionHeader("triage"))
    lines.push(
      `{gray-fg}verdict:{/gray-fg} {${verdictColor}-fg}{bold}${verdict}{/bold}{/${verdictColor}-fg}`,
    )
    lines.push(`{gray-fg}reasoning:{/gray-fg} ${escapeTags(issue.triage.reasoning)}`)

    const enrich = issue.triage.enrichment
    if (enrich) {
      if (enrich.context) {
        lines.push("")
        lines.push(sectionHeader("context"))
        lines.push(escapeTags(enrich.context))
      }

      lines.push("")
      lines.push(sectionHeader("suggested fix"))
      lines.push(escapeTags(enrich.minimalFix.summary))
      if (enrich.minimalFix.patch) {
        lines.push("")
        const lang = enrich.minimalFix.language ?? ""
        lines.push(`{gray-fg}\`\`\`${escapeTags(lang)}{/gray-fg}`)
        lines.push(formatCodeBlock(enrich.minimalFix.patch, lang))
        lines.push(`{gray-fg}\`\`\`{/gray-fg}`)
      }

      if (enrich.promptForAgents?.trim()) {
        lines.push("")
        lines.push(sectionHeader("prompt for ai agents"))
        lines.push(`{gray-fg}(press [c] to copy){/gray-fg}`)
        lines.push("")
        lines.push(escapeTags(enrich.promptForAgents))
      }
    }
  }

  return lines.join("\n")
}

function sectionHeader(label: string): string {
  return `{${DASH_COLORS.accent}-fg}{bold}❯ ${label}{/bold}{/${DASH_COLORS.accent}-fg}`
}

/**
 * Render a fenced code block. For `diff` patches, colour each line
 * based on its unified-diff prefix so additions/removals/hunk headers
 * pop like in a real diff viewer. Non-diff blocks stay in the accent
 * colour so they still read as code.
 */
export function formatCodeBlock(patch: string, language: string): string {
  if (language.toLowerCase() === "diff") return formatDiff(patch)
  return `{${DASH_COLORS.accent}-fg}${escapeTags(patch)}{/${DASH_COLORS.accent}-fg}`
}

export function formatDiff(patch: string): string {
  // Dark-tinted backgrounds keep the bg suggestion from overpowering
  // the surrounding panel while still giving a clear "added vs removed"
  // silhouette. Hex colours work on any 256-colour terminal (blessed
  // falls back gracefully on 16-colour terminals).
  const ADD_BG = "#143a14"
  const DEL_BG = "#4a1c1c"
  const HUNK_BG = "#1c2a4a"

  return patch
    .split("\n")
    .map((raw) => {
      const escaped = escapeTags(raw)
      if (raw.startsWith("+++") || raw.startsWith("---")) {
        // File header lines: dimmed, no bg
        return `{gray-fg}{bold}${escaped}{/bold}{/gray-fg}`
      }
      if (raw.startsWith("@@")) {
        return `{${HUNK_BG}-bg}{cyan-fg}${escaped}{/cyan-fg}{/${HUNK_BG}-bg}`
      }
      if (raw.startsWith("+")) {
        return `{${ADD_BG}-bg}{green-fg}${escaped}{/green-fg}{/${ADD_BG}-bg}`
      }
      if (raw.startsWith("-")) {
        return `{${DEL_BG}-bg}{red-fg}${escaped}{/red-fg}{/${DEL_BG}-bg}`
      }
      return `{gray-fg}${escaped}{/gray-fg}`
    })
    .join("\n")
}

function severityColor(severity: ReviewIssue["severity"]): string {
  switch (severity) {
    case "critical":
    case "high":
      return DASH_COLORS.danger
    case "medium":
      return DASH_COLORS.warn
    case "low":
      return "gray"
  }
}

function categoryColor(category: ReviewIssue["category"]): string {
  switch (category) {
    case "security":
      return DASH_COLORS.danger
    case "bug":
      return DASH_COLORS.warn
    case "performance":
      return DASH_COLORS.accent
    case "compliance":
      return DASH_COLORS.warn
    case "architecture":
      return DASH_COLORS.accent
    case "style":
      return "gray"
  }
}
