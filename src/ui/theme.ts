import chalk from "chalk"

export const SEVERITY_ORDER = ["critical", "high", "medium", "low"] as const

export const SEVERITY_COLORS: Record<string, (s: string) => string> = {
  critical: chalk.red.bold,
  high: chalk.red,
  medium: chalk.yellow,
  low: chalk.dim,
}
