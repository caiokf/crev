import { afterEach, describe, expect, it } from "vitest"
import {
  startFix,
  getFixState,
  getActiveFixStates,
  updateFixProgress,
  completeFix,
  failFix,
  clearFixState,
  isFixRunning,
  isBulkFixRunning,
  isIssueBeingFixed,
  formatElapsed,
} from "./fix-state.js"

const FILE = "/test/review.json"

afterEach(() => {
  // Clean up all state between tests
  completeFix(FILE)
  clearFixState(FILE)
  for (const id of ["i-1", "i-2", "i-3"]) {
    completeFix(FILE, id)
    clearFixState(FILE, id)
  }
})

describe("fix-state", () => {
  it("startFix creates a new state entry for bulk", () => {
    expect(startFix(FILE, { kind: "bulk" }, "claude", "sonnet", 3)).toBe(true)
    const state = getFixState(FILE)
    expect(state).toBeDefined()
    expect(state!.mode).toEqual({ kind: "bulk" })
    expect(state!.runtime).toBe("claude")
    expect(state!.model).toBe("sonnet")
    expect(state!.total).toBe(3)
    expect(state!.completed).toBe(0)
    expect(state!.finishedAt).toBeNull()
  })

  it("startFix creates a new state entry for single issue", () => {
    expect(startFix(FILE, { kind: "single", issueId: "i-1" }, "claude", "sonnet", 1)).toBe(true)
    const state = getFixState(FILE, "i-1")
    expect(state).toBeDefined()
    expect(state!.mode).toEqual({ kind: "single", issueId: "i-1" })
  })

  it("bulk blocks if single-issue fix is running", () => {
    startFix(FILE, { kind: "single", issueId: "i-1" }, "claude", "sonnet", 1)
    expect(startFix(FILE, { kind: "bulk" }, "claude", "sonnet", 3)).toBe(false)
  })

  it("single-issue fix blocks if bulk is running", () => {
    startFix(FILE, { kind: "bulk" }, "claude", "sonnet", 3)
    expect(startFix(FILE, { kind: "single", issueId: "i-1" }, "claude", "sonnet", 1)).toBe(false)
  })

  it("allows multiple single-issue fixes for different issues", () => {
    expect(startFix(FILE, { kind: "single", issueId: "i-1" }, "claude", "sonnet", 1)).toBe(true)
    expect(startFix(FILE, { kind: "single", issueId: "i-2" }, "claude", "sonnet", 1)).toBe(true)
    expect(startFix(FILE, { kind: "single", issueId: "i-3" }, "claude", "sonnet", 1)).toBe(true)
  })

  it("blocks duplicate single-issue fix for same issue", () => {
    startFix(FILE, { kind: "single", issueId: "i-1" }, "claude", "sonnet", 1)
    expect(startFix(FILE, { kind: "single", issueId: "i-1" }, "claude", "sonnet", 1)).toBe(false)
  })

  it("startFix allows restarting after completion", () => {
    startFix(FILE, { kind: "bulk" }, "claude", "sonnet", 3)
    completeFix(FILE)
    expect(startFix(FILE, { kind: "single", issueId: "i-1" }, "claude", "sonnet", 1)).toBe(true)
  })

  it("updateFixProgress updates completed count and appends status", () => {
    startFix(FILE, { kind: "bulk" }, "claude", "sonnet", 3)
    updateFixProgress(FILE, 1, 3, { id: "i-1", status: "fixed", reasoning: "done" })
    const state = getFixState(FILE)!
    expect(state.completed).toBe(1)
    expect(state.statuses).toHaveLength(1)
    expect(state.statuses[0].id).toBe("i-1")
  })

  it("updateFixProgress works with issue-scoped keys", () => {
    startFix(FILE, { kind: "single", issueId: "i-1" }, "claude", "sonnet", 1)
    updateFixProgress(FILE, 1, 1, { id: "i-1", status: "fixed", reasoning: "done" }, "i-1")
    const state = getFixState(FILE, "i-1")!
    expect(state.completed).toBe(1)
  })

  it("completeFix sets finishedAt", () => {
    startFix(FILE, { kind: "bulk" }, "claude", "sonnet", 3)
    completeFix(FILE)
    const state = getFixState(FILE)!
    expect(state.finishedAt).toBeTypeOf("number")
  })

  it("completeFix works with issue-scoped keys", () => {
    startFix(FILE, { kind: "single", issueId: "i-1" }, "claude", "sonnet", 1)
    completeFix(FILE, "i-1")
    const state = getFixState(FILE, "i-1")!
    expect(state.finishedAt).toBeTypeOf("number")
  })

  it("failFix sets finishedAt and error", () => {
    startFix(FILE, { kind: "bulk" }, "claude", "sonnet", 3)
    failFix(FILE, "agent crashed")
    const state = getFixState(FILE)!
    expect(state.finishedAt).not.toBeNull()
    expect(state.error).toBe("agent crashed")
  })

  it("clearFixState removes completed state", () => {
    startFix(FILE, { kind: "bulk" }, "claude", "sonnet", 3)
    completeFix(FILE)
    clearFixState(FILE)
    expect(getFixState(FILE)).toBeUndefined()
  })

  it("clearFixState does not remove running state", () => {
    startFix(FILE, { kind: "bulk" }, "claude", "sonnet", 3)
    clearFixState(FILE)
    expect(getFixState(FILE)).toBeDefined()
  })

  it("isBulkFixRunning only returns true for bulk", () => {
    startFix(FILE, { kind: "single", issueId: "i-1" }, "claude", "sonnet", 1)
    expect(isBulkFixRunning(FILE)).toBe(false)
    completeFix(FILE, "i-1")

    startFix(FILE, { kind: "bulk" }, "claude", "sonnet", 3)
    expect(isBulkFixRunning(FILE)).toBe(true)
  })

  it("isFixRunning returns true for any active fix", () => {
    startFix(FILE, { kind: "single", issueId: "i-1" }, "claude", "sonnet", 1)
    expect(isFixRunning(FILE)).toBe(true)
    completeFix(FILE, "i-1")
    expect(isFixRunning(FILE)).toBe(false)
  })

  it("getActiveFixStates returns all active states for a file", () => {
    startFix(FILE, { kind: "single", issueId: "i-1" }, "claude", "sonnet", 1)
    startFix(FILE, { kind: "single", issueId: "i-2" }, "claude", "sonnet", 1)
    expect(getActiveFixStates(FILE)).toHaveLength(2)
    completeFix(FILE, "i-1")
    expect(getActiveFixStates(FILE)).toHaveLength(1)
  })

  it("isIssueBeingFixed returns true for single-issue fix", () => {
    startFix(FILE, { kind: "single", issueId: "i-1" }, "claude", "sonnet", 1)
    expect(isIssueBeingFixed(FILE, "i-1")).toBe(true)
    expect(isIssueBeingFixed(FILE, "i-2")).toBe(false)
  })

  it("isIssueBeingFixed returns true for all issues in bulk mode", () => {
    startFix(FILE, { kind: "bulk" }, "claude", "sonnet", 3)
    expect(isIssueBeingFixed(FILE, "i-1")).toBe(true)
    expect(isIssueBeingFixed(FILE, "i-2")).toBe(true)
  })

  it("isIssueBeingFixed returns false when not running", () => {
    expect(isIssueBeingFixed(FILE, "i-1")).toBe(false)
  })

  it("formatElapsed formats seconds", () => {
    const now = Date.now()
    expect(formatElapsed(now - 30_000)).toBe("30s")
  })

  it("formatElapsed formats minutes and seconds", () => {
    const now = Date.now()
    expect(formatElapsed(now - 90_000)).toBe("1m 30s")
  })
})
