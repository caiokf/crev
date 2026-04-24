import type { FixStatus } from "../core/fix.js"

/**
 * Shared fix execution state. Lives outside views so navigation
 * between run-detail ↔ issue-detail preserves running state.
 *
 * Mutual-exclusion rules (per review file):
 *  - Multiple single-issue fixes for *different* issues → allowed
 *  - Bulk fix blocks if any fix (bulk or single) is active
 *  - Single-issue fix blocks if a bulk fix is active
 *  - Same issue can't be fixed twice concurrently
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

/**
 * Internal key: bulk uses `filePath`, single uses `filePath\0issueId`.
 * The separator ensures no collision with real file paths.
 */
function stateKey(filePath: string, mode: FixMode): string {
  return mode.kind === "bulk" ? filePath : `${filePath}\0${mode.issueId}`
}

const runningFixes = new Map<string, FixRunState>()

/** Get the fix state for a specific key (bulk or single issue). */
export function getFixState(filePath: string, issueId?: string): FixRunState | undefined {
  if (issueId) {
    return runningFixes.get(`${filePath}\0${issueId}`)
  }
  // Check bulk first
  const bulk = runningFixes.get(filePath)
  if (bulk) return bulk
  return undefined
}

/** Get all active (not finished) fix states for a review file. */
export function getActiveFixStates(filePath: string): FixRunState[] {
  const results: FixRunState[] = []
  for (const [key, state] of runningFixes) {
    if (!state.finishedAt && (key === filePath || key.startsWith(`${filePath}\0`))) {
      results.push(state)
    }
  }
  return results
}

/**
 * Start tracking a fix run. Returns false if mutual exclusion blocks it:
 *  - bulk: blocked if any fix is active for this file
 *  - single: blocked if a bulk fix is active, or this issue is already being fixed
 */
export function startFix(
  filePath: string,
  mode: FixMode,
  runtime: string,
  model: string,
  total: number,
): boolean {
  const active = getActiveFixStates(filePath)

  if (mode.kind === "bulk") {
    // Bulk can't start if anything is running for this file
    if (active.length > 0) return false
  } else {
    // Single can't start if bulk is running or same issue is active
    if (active.some((s) => s.mode.kind === "bulk")) return false
    if (active.some((s) => s.mode.kind === "single" && s.mode.issueId === mode.issueId)) return false
  }

  const key = stateKey(filePath, mode)
  runningFixes.set(key, {
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
  issueId?: string,
): void {
  const key = issueId ? `${filePath}\0${issueId}` : filePath
  const state = runningFixes.get(key)
  if (!state) return
  state.completed = completed
  state.total = total
  state.statuses.push(status)
}

/** Mark a fix run as completed. */
export function completeFix(filePath: string, issueId?: string): void {
  const key = issueId ? `${filePath}\0${issueId}` : filePath
  const state = runningFixes.get(key)
  if (!state) return
  state.finishedAt = Date.now()
}

/** Mark a fix run as failed. */
export function failFix(filePath: string, error: string, issueId?: string): void {
  const key = issueId ? `${filePath}\0${issueId}` : filePath
  const state = runningFixes.get(key)
  if (!state) return
  state.finishedAt = Date.now()
  state.error = error
}

/** Clear completed/failed fix state. */
export function clearFixState(filePath: string, issueId?: string): void {
  const key = issueId ? `${filePath}\0${issueId}` : filePath
  const state = runningFixes.get(key)
  if (state?.finishedAt) runningFixes.delete(key)
}

/** Check if a bulk fix is currently running for this review. */
export function isBulkFixRunning(filePath: string): boolean {
  const state = runningFixes.get(filePath)
  return !!state && !state.finishedAt
}

/** Check if any fix is currently running for this review (bulk or single). */
export function isFixRunning(filePath: string): boolean {
  return getActiveFixStates(filePath).length > 0
}

/** Check if a specific issue is being fixed (directly or via bulk). */
export function isIssueBeingFixed(filePath: string, issueId: string): boolean {
  const active = getActiveFixStates(filePath)
  return active.some(
    (s) => s.mode.kind === "bulk" || (s.mode.kind === "single" && s.mode.issueId === issueId),
  )
}

/** Format elapsed time for display. */
export function formatElapsed(startedAt: number): string {
  const elapsed = Math.round((Date.now() - startedAt) / 1000)
  if (elapsed < 60) return `${elapsed}s`
  const mins = Math.floor(elapsed / 60)
  const secs = elapsed % 60
  return `${mins}m ${secs}s`
}
