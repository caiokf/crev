import { execFile } from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import { promisify } from "node:util"
import type { DiffInput } from "@crev/runtimes"
import type { DiffSource } from "./types.js"

const execFileAsync = promisify(execFile)
const MAX_BUFFER = 50 * 1024 * 1024

export type DiffOptions = {
  slug: string
  source: DiffSource
  exclude?: string[]
  crevDir: string
}

export async function resolveDiff(opts: DiffOptions): Promise<DiffInput> {
  let diffContent: string

  switch (opts.source.kind) {
    case "pr":
      diffContent = await getPrDiff(String(opts.source.pr))
      break
    case "commit":
      diffContent = await getCommitDiff(opts.source.baseCommit)
      break
    case "branch":
      diffContent = opts.source.type === "current-state"
        ? await getCurrentStateDiff()
        : await getBranchDiff(opts.source.base, opts.source.type)
      break
    case "local":
      diffContent = opts.source.type === "current-state"
        ? await getCurrentStateDiff()
        : await getTypeDiff(opts.source.type)
      break
  }

  if (opts.exclude && opts.exclude.length > 0) {
    diffContent = filterDiff(diffContent, opts.exclude)
  }

  const diffDir = path.join(opts.crevDir, "diffs")
  fs.mkdirSync(diffDir, { recursive: true })
  const diffFile = path.join(diffDir, `${buildDatedSlug(opts.slug)}.diff`)
  fs.writeFileSync(diffFile, diffContent, "utf-8")

  return {
    diffContent,
    diffFile,
    base: opts.source.kind === "branch" ? opts.source.base : undefined,
    baseCommit: opts.source.kind === "commit" ? opts.source.baseCommit : undefined,
    type: opts.source.kind === "pr" ? "all" : opts.source.type,
  }
}

function buildDatedSlug(slug: string): string {
  const now = new Date()
  const datePart = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
    String(now.getHours()).padStart(2, "0") + String(now.getMinutes()).padStart(2, "0"),
  ].join("-")

  return `${datePart}-${slug}`
}

export function cleanupDiffFile(diff: DiffInput): void {
  try {
    if (diff.diffFile && fs.existsSync(diff.diffFile)) {
      fs.unlinkSync(diff.diffFile)
    }
  } catch {
    // Best-effort cleanup
  }
}

async function getPrDiff(pr: string): Promise<string> {
  const { stdout } = await execFileAsync("gh", ["pr", "diff", pr], { maxBuffer: MAX_BUFFER })
  return stdout
}

async function getBranchDiff(base: string, type: "all" | "committed" | "uncommitted"): Promise<string> {
  if (type === "uncommitted") {
    const { stdout } = await execFileAsync("git", ["diff"], { maxBuffer: MAX_BUFFER })
    return stdout
  }

  if (type === "committed") {
    const { stdout } = await execFileAsync("git", ["diff", `${base}...HEAD`], { maxBuffer: MAX_BUFFER })
    return stdout
  }

  const { stdout } = await execFileAsync("git", ["diff", base], { maxBuffer: MAX_BUFFER })
  return stdout
}

async function getCommitDiff(baseCommit: string): Promise<string> {
  const { stdout } = await execFileAsync("git", ["diff", `${baseCommit}...HEAD`], { maxBuffer: MAX_BUFFER })
  return stdout
}

async function getCurrentStateDiff(): Promise<string> {
  const { stdout: emptyTree } = await execFileAsync("git", ["hash-object", "-t", "tree", "/dev/null"])
  const { stdout } = await execFileAsync("git", ["diff", emptyTree.trim(), "HEAD"], { maxBuffer: MAX_BUFFER })
  return stdout
}

async function getTypeDiff(type: "all" | "committed" | "uncommitted"): Promise<string> {
  if (type === "uncommitted") {
    const { stdout } = await execFileAsync("git", ["diff"], { maxBuffer: MAX_BUFFER })
    return stdout
  }

  if (type === "committed") {
    const { stdout } = await execFileAsync("git", ["diff", "HEAD~1..HEAD"], { maxBuffer: MAX_BUFFER })
    return stdout
  }

  const staged = await execFileAsync("git", ["diff", "--staged"], { maxBuffer: MAX_BUFFER })
  const unstaged = await execFileAsync("git", ["diff"], { maxBuffer: MAX_BUFFER })
  return [staged.stdout, unstaged.stdout].filter(Boolean).join("\n")
}

export function filterDiff(diffContent: string, excludePatterns: string[]): string {
  const lines = diffContent.split("\n")
  const filtered: string[] = []
  let skip = false

  for (const line of lines) {
    if (line.startsWith("diff --git")) {
      const filePath = extractFilePath(line)
      skip = filePath !== null && excludePatterns.some((p) => matchesGlob(filePath, p))
    }

    if (!skip) {
      filtered.push(line)
    }
  }

  return filtered.join("\n")
}

function extractFilePath(diffLine: string): string | null {
  const match = diffLine.match(/^diff --git a\/(.+?) b\//)
  return match?.[1] ?? null
}

function matchesGlob(filePath: string, pattern: string): boolean {
  if (pattern.startsWith("**/")) {
    const suffix = pattern.slice(3)
    if (suffix.startsWith("*.")) {
      const ext = suffix.slice(1)
      return filePath.endsWith(ext)
    }
    return filePath.endsWith(suffix) || filePath.includes(`/${suffix}`)
  }
  if (pattern.startsWith("*.")) {
    const ext = pattern.slice(1)
    return filePath.endsWith(ext)
  }
  return filePath === pattern || filePath.endsWith(`/${pattern}`)
}
