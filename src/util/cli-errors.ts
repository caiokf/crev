import fs from "node:fs"
import chalk from "chalk"

export function exitWithError(message: string): never {
  console.error(message)
  process.exit(1)
}

export function exitWithCode(code = 1): never {
  process.exit(code)
}

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

export function readFileOrDie(filePath: string, label = "File"): string {
  if (!fs.existsSync(filePath)) {
    exitWithError(chalk.red(`Error: ${label} not found: ${filePath}`))
  }
  return fs.readFileSync(filePath, "utf-8")
}
