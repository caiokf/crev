import chalk from "chalk"
import { padVisible } from "./ansi.js"

const BRAILLE_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"]
const BAR = "│"
const TICK = chalk.green("◆")
const CROSS = chalk.red("▲")
const HIDE_CURSOR = "\x1B[?25l"
const SHOW_CURSOR = "\x1B[?25h"
const ERASE_LINE = "\x1B[2K"

type EntryState = "pending" | "running" | "done" | "failed" | "cancelled"

type Entry = {
  name: string
  detail: string
  prefix?: string
  state: EntryState
  startedAt: number
  finishedElapsed: number
  resultText?: string
}

export type MultiSpinnerAction = "finalize" | "quit" | null

export type UpdateOpts = {
  elapsed?: number
  resultText?: string
  detail?: string
}

export type MultiSpinnerHandle = {
  addEntry(name: string, detail: string): void
  updateEntry(name: string, state: EntryState, opts?: UpdateOpts): void
  stop(): void
  clear(): void
  onAction(callback: (action: MultiSpinnerAction) => void): void
}

export type MultiSpinnerOptions = {
  runningLabel?: string
  doneLabel?: string
  showKeyHints?: boolean
}

export function createMultiSpinner(
  entries: Array<{ name: string; detail: string; prefix?: string }>,
  options?: MultiSpinnerOptions,
): MultiSpinnerHandle {
  const runningLabel = options?.runningLabel ?? "Reviewing"
  const doneLabel = options?.doneLabel ?? "All reviews complete"
  const enableKeyHints = options?.showKeyHints ?? true

  const state: Entry[] = entries.map((e) => ({
    name: e.name,
    detail: e.detail,
    prefix: e.prefix,
    state: "running" as EntryState,
    startedAt: performance.now(),
    finishedElapsed: 0,
  }))

  let frameIndex = 0
  let lineCount = 0
  let stopped = false
  let showKeyHints = enableKeyHints
  const startTime = performance.now()
  let actionCallback: ((action: MultiSpinnerAction) => void) | null = null

  const stream = process.stdout
  const isTTY = stream.isTTY

  if (!isTTY) {
    // Non-TTY: plain output mode
    return createPlainSpinner(state)
  }

  const canRawMode = typeof process.stdin.setRawMode === "function"

  function setupKeyboard(): void {
    if (!canRawMode) return
    process.stdin.setRawMode(true)
    process.stdin.resume()
    process.stdin.setEncoding("utf-8")
    process.stdin.on("data", onKeypress)
  }

  function teardownKeyboard(): void {
    if (!canRawMode) return
    process.stdin.removeListener("data", onKeypress)
    process.stdin.setRawMode(false)
    process.stdin.pause()
  }

  function onKeypress(key: string): void {
    if (key === "\x03") {
      stopped = true
      clearInterval(interval)
      teardownKeyboard()
      stream.write(SHOW_CURSOR)
      process.exit(130)
    }

    const k = key.toLowerCase()
    if (k === "f") {
      actionCallback?.("finalize")
    } else if (k === "q") {
      actionCallback?.("quit")
    }
  }

  function render(): void {
    if (stopped) return

    if (lineCount > 0) {
      stream.write(`\x1B[${lineCount}A`)
    }

    const lines: string[] = []
    const running = state.filter((e) => e.state === "running").length
    const done = state.filter((e) => e.state === "done" || e.state === "failed").length
    const total = state.length
    const totalElapsed = formatTime((performance.now() - startTime) / 1000)
    const spinner = chalk.cyan(BRAILLE_FRAMES[frameIndex % BRAILLE_FRAMES.length])

    lines.push(`${BAR}`)

    if (running > 0) {
      lines.push(
        `${BAR}  ${spinner} ${chalk.bold(runningLabel)} ${chalk.dim(`${done}/${total} complete`)} ${chalk.dim(`(${totalElapsed})`)}`,
      )
    } else {
      lines.push(`${BAR}  ${TICK} ${chalk.bold(doneLabel)} ${chalk.dim(`(${totalElapsed})`)}`)
    }

    const nameCol = maxNameWidth(state)
    for (const entry of state) {
      lines.push(`${BAR}    ${formatEntry(entry, frameIndex, nameCol)}`)
    }

    if (showKeyHints && running > 0) {
      lines.push(
        `${BAR}  ${chalk.dim("[")}${chalk.white("f")}${chalk.dim("] finalize with completed")}  ${chalk.dim("[")}${chalk.white("q")}${chalk.dim("] quit and discard")}`,
      )
    } else {
      lines.push(`${BAR}`)
    }

    // Write new lines, then erase any leftover old lines if count shrank
    for (const line of lines) {
      stream.write(`${ERASE_LINE}${line}\n`)
    }
    for (let i = lines.length; i < lineCount; i++) {
      stream.write(`${ERASE_LINE}\n`)
    }
    // If we wrote more lines total than new content, move cursor back
    const totalWritten = Math.max(lines.length, lineCount)
    if (totalWritten > lines.length) {
      stream.write(`\x1B[${totalWritten - lines.length}A`)
    }

    lineCount = lines.length
    frameIndex++
  }

  stream.write(HIDE_CURSOR)
  process.on("exit", () => stream.write(SHOW_CURSOR))
  setupKeyboard()
  render()
  const interval = setInterval(render, 80)

  return {
    addEntry(name, detail) {
      showKeyHints = false
      state.push({
        name,
        detail,
        state: "running",
        startedAt: performance.now(),
        finishedElapsed: 0,
      })
    },

    updateEntry(name, newState, opts) {
      const entry = state.find((e) => e.name === name)
      if (!entry) return
      entry.state = newState
      if (opts?.elapsed !== undefined) entry.finishedElapsed = opts.elapsed
      if (opts?.resultText !== undefined) entry.resultText = opts.resultText
      if (opts?.detail !== undefined) entry.detail = opts.detail
    },

    stop() {
      if (stopped) return
      stopped = true
      clearInterval(interval)
      teardownKeyboard()
      try {
        stopped = false
        render()
      } finally {
        stopped = true
        stream.write(SHOW_CURSOR)
      }
    },

    clear() {
      if (stopped) return
      stopped = true
      clearInterval(interval)
      teardownKeyboard()
      if (lineCount > 0) {
        stream.write(`\x1B[${lineCount}A`)
        for (let i = 0; i < lineCount; i++) {
          stream.write(`${ERASE_LINE}\n`)
        }
        stream.write(`\x1B[${lineCount}A`)
      }
      stream.write(SHOW_CURSOR)
    },

    onAction(callback) {
      actionCallback = callback
    },
  }
}

function createPlainSpinner(state: Entry[]): MultiSpinnerHandle {
  return {
    addEntry() {},
    updateEntry(name, newState, opts) {
      const entry = state.find((e) => e.name === name)
      if (!entry) return
      entry.state = newState
      if (newState === "done" || newState === "failed") {
        const elapsed = opts?.elapsed ? `(${opts.elapsed.toFixed(1)}s)` : ""
        const result = opts?.resultText ?? ""
        console.log(`  ${newState === "done" ? "✓" : "✗"} ${name} ${result} ${elapsed}`)
      }
    },
    stop() {},
    clear() {},
    onAction() {},
  }
}


function maxNameWidth(entries: Entry[]): number {
  return entries.reduce((max, e) => {
    const labelWidth = e.prefix ? e.prefix.length + 1 + e.name.length + 1 : e.name.length
    const w = labelWidth + 1 + e.detail.length
    return Math.max(max, w)
  }, 0)
}

function formatLabel(entry: Entry): string {
  if (entry.prefix) {
    return `${chalk.blue(entry.name)}(${chalk.green(entry.prefix)})`
  }
  return chalk.blue(entry.name)
}

function formatEntry(entry: Entry, frameIndex: number, nameCol: number): string {
  const label = formatLabel(entry)
  const detail = chalk.dim(entry.detail)
  const nameAndDetail = padVisible(`${label} ${detail}`, nameCol)
  const ELAPSED_COL = 7

  switch (entry.state) {
    case "pending":
      return `${chalk.dim("○")} ${padVisible(`${chalk.dim(entry.name)} ${detail}`, nameCol)} ${chalk.dim("waiting")}`
    case "running": {
      const spinner = chalk.cyan(BRAILLE_FRAMES[frameIndex % BRAILLE_FRAMES.length])
      const liveElapsed = (performance.now() - entry.startedAt) / 1000
      const elapsed = padVisible(chalk.white(formatTime(liveElapsed)), ELAPSED_COL)
      return `${spinner} ${nameAndDetail} ${elapsed}`
    }
    case "done": {
      const elapsed = padVisible(chalk.white(formatTime(entry.finishedElapsed)), ELAPSED_COL)
      const result = entry.resultText ?? formatIssueCount(0)
      return `${TICK} ${nameAndDetail} ${elapsed} ${result}`
    }
    case "failed": {
      const elapsed = padVisible(chalk.white(formatTime(entry.finishedElapsed)), ELAPSED_COL)
      return `${CROSS} ${nameAndDetail} ${elapsed} ${chalk.red("failed")}`
    }
    case "cancelled":
      return `${chalk.yellow("■")} ${padVisible(`${chalk.dim(entry.name)} ${detail}`, nameCol)} ${chalk.yellow("cancelled")}`
  }
}

function formatIssueCount(count: number): string {
  if (count === 0) return chalk.green("no issues")
  const label = count === 1 ? "issue" : "issues"
  if (count <= 2) return chalk.yellow(`${count} ${label}`)
  return chalk.red(`${count} ${label}`)
}

export function formatIssueSummary(count: number): string {
  return formatIssueCount(count)
}

function formatTime(seconds: number): string {
  if (seconds < 60) return `${seconds.toFixed(1)}s`
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}m ${String(secs).padStart(2, "0")}s`
}
