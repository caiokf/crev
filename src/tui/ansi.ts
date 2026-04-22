import chalk from "chalk"

// eslint-disable-next-line no-control-regex
export const ANSI_RE = /\x1B\[[0-9;]*m/g

export function visibleLength(s: string): number {
  return s.replace(ANSI_RE, "").length
}

export function padVisible(s: string, width: number): string {
  const pad = width - visibleLength(s)
  return pad > 0 ? s + " ".repeat(pad) : s
}

// Matches any ANSI escape sequence (SGR, cursor, erase, etc.)
const ANSI_ESCAPE_RE = /\x1B(?:\[[0-9;]*[a-zA-Z]|\][^\x07]*\x07)/

export function truncateVisible(s: string, maxLen: number): string {
  const stripped = s.replace(ANSI_RE, "")
  if (stripped.length <= maxLen) return s

  let visible = 0
  let i = 0
  while (i < s.length && visible < maxLen - 1) {
    if (s[i] === "\x1B") {
      const match = s.slice(i).match(ANSI_ESCAPE_RE)
      if (match && s.slice(i).startsWith(match[0])) {
        i += match[0].length
        continue
      }
    }
    visible++
    i++
  }
  return s.slice(0, i) + chalk.reset("…")
}
