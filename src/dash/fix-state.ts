import type { FixStatus } from "../core/fix.js"

/**
 * Shared fix execution state. Lives outside views so navigation
 * between run-detail ↔ issue-detail preserves running state. A single
 * module-level map keyed by review file path ensures:
 *  - only one fix operation per review at a time
 *  - navigating away and back still shows progress
 *  - bulk and single-issue fixes are mutually exclusive per review
 */

export type FixMode =
  | { readonly kind: "bulk" }
  | { readonly kind: "single"; readonly issueId: string }

export type FixRunState = {
  mode: FixMode
  runtime: string
  model: string
  startedAt: number
  completed: number
  total: number
  statuses: FixStatus[]
  /** null while running, set on completion */
  finishedAt: number | null
  error: string | null
}

const runningFixes = new Map<string, FixRunState>()

/** Get the current fix state for a review file. */
export function getFixState(filePath: string): FixRunState | undefined {
  return runningFixes.get(filePath)
}

/** Start tracking a fix run. Returns false if one is already active. */
export function startFix(
  filePath: string,
  mode: FixMode,
  runtime: string,
  model: string,
  total: number,
): boolean {
  const existing = runningFixes.get(filePath)
  if (existing && !existing.finishedAt) return false // already running
  runningFixes.set(filePath, {
    mode,
    runtime,
    model,
    startedAt: Date.now(),
    completed: 0,
    total,
    statuses: [],
    finishedAt: null,
    error: null,
  })
  return true
}

/** Update progress for a running fix. */
export function updateFixProgress(
  filePath: string,
  completed: number,
  total: number,
  status: FixStatus,
): void {
  const state = runningFixes.get(filePath)
  if (!state) return
  state.completed = completed
  state.total = total
  state.statuses.push(status)
}

/** Mark a fix run as completed. */
export function completeFix(filePath: string): void {
  const state = runningFixes.get(filePath)
  if (!state) return
  state.finishedAt = Date.now()
}

/** Mark a fix run as failed. */
export function failFix(filePath: string, error: string): void {
  const state = runningFixes.get(filePath)
  if (!state) return
  state.finishedAt = Date.now()
  state.error = error
}

/** Clear completed/failed fix state for a review. */
export function clearFixState(filePath: string): void {
  const state = runningFixes.get(filePath)
  if (state?.finishedAt) runningFixes.delete(filePath)
}

/** Check if a fix is currently running (not finished) for this review. */
export function isFixRunning(filePath: string): boolean {
  const state = runningFixes.get(filePath)
  return !!state && !state.finishedAt
}

/** Check if a specific issue is being fixed. */
export function isIssueBeingFixed(filePath: string, issueId: string): boolean {
  const state = runningFixes.get(filePath)
  if (!state || state.finishedAt) return false
  if (state.mode.kind === "single") return state.mode.issueId === issueId
  // In bulk mode, all actionable issues are being fixed
  return true
}

/** Format elapsed time for display. */
export function formatElapsed(startedAt: number): string {
  const elapsed = Math.round((Date.now() - startedAt) / 1000)
  if (elapsed < 60) return `${elapsed}s`
  const mins = Math.floor(elapsed / 60)
  const secs = elapsed % 60
  return `${mins}m ${secs}s`
}
