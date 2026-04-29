export function separator(cols: number = process.stdout.columns ?? 80): string {
  return "─".repeat(Math.max(0, Math.min(60, cols - 4)))
}
