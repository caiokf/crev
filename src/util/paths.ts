import fs from "node:fs"
import path from "node:path"
import chalk from "chalk"

export function findProjectRoot(startDir?: string): string {
  let dir = startDir ?? process.cwd()

  // Walk up looking for .crev/ or .git/
  while (dir !== path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, ".crev"))) return dir
    if (fs.existsSync(path.join(dir, ".git"))) return dir
    dir = path.dirname(dir)
  }

  return startDir ?? process.cwd()
}

export function getCrevDir(projectRoot: string): string {
  return path.join(projectRoot, ".crev")
}

export function getSchemasDir(crevDir: string): string {
  return path.join(crevDir, "schemas")
}

export function getReviewsDir(crevDir: string): string {
  return path.join(crevDir, "reviews")
}

export function getDiffsDir(crevDir: string): string {
  return path.join(crevDir, "diffs")
}

export function writeIfNew(filePath: string, content: string): void {
  if (fs.existsSync(filePath) && fs.readFileSync(filePath, "utf-8").trim()) {
    return
  }
  fs.writeFileSync(filePath, content, "utf-8")
  console.log(`${chalk.green("✓")} Created ${path.relative(process.cwd(), filePath)}`)
}
