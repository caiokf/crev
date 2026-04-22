import crypto from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import chalk from "chalk"

export function getSchemasDir(crevDir: string): string {
  return path.join(crevDir, "schemas")
}

/** Convert a name to a lowercase slug suitable for IDs and file names. */
export function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/-+$/, "")
}

/** Generate a short random hex suffix (e.g. "a3f1b2") for unique file names. */
export function uniqueSuffix(): string {
  return crypto.randomBytes(3).toString("hex")
}

export function writeIfNew(filePath: string, content: string): void {
  if (fs.existsSync(filePath) && fs.readFileSync(filePath, "utf-8").trim()) {
    return
  }
  fs.writeFileSync(filePath, content, "utf-8")
  console.log(`${chalk.green("✓")} Created ${path.relative(process.cwd(), filePath)}`)
}
