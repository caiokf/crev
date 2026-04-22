import { execFile } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { promisify } from "node:util"
import type { DiffInput } from "@caiokf/valet"
import type { DiffSource } from "./types.js"
import { uniqueSuffix } from "../util/paths.js"

const execFileAsync = promisify(execFile)
const MAX_BUFFER = 50 * 1024 * 1024

export type DiffOptions = {
  slug: string
  source: DiffSource
  analyze?: boolean
  exclude?: string[]
  crevDir: string
}

export async function resolveDiff(opts: DiffOptions): Promise<DiffInput> {
  let diffContent: string

  if (opts.analyze) {
    diffContent = await getAnalyzeDiff()
  } else {
    switch (opts.source.kind) {
      case "pr":
        diffContent = await getPrDiff(String(opts.source.pr))
        break
      case "commit":
        diffContent = await getCommitDiff(opts.source.baseCommit)
        break
      case "branch":
        diffContent = await getBranchDiff(opts.source.base, opts.source.type)
        break
      case "local":
        diffContent = await getTypeDiff(opts.source.type)
        break
    }
  }

  if (opts.exclude && opts.exclude.length > 0) {
    diffContent = filterDiff(diffContent, opts.exclude)
  }

  const diffFile = path.join(os.tmpdir(), `crev-diff-${opts.slug}-${process.pid}-${uniqueSuffix()}.diff`)
  fs.writeFileSync(diffFile, diffContent, "utf-8")

  return {
    diffContent,
    diffFile,
    base: opts.source.kind === "branch" ? opts.source.base : undefined,
    baseCommit: opts.source.kind === "commit" ? opts.source.baseCommit : undefined,
    type: opts.analyze ? "all" : (opts.source.kind === "pr" ? "all" : opts.source.type),
  }
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

async function getAnalyzeDiff(): Promise<string> {
  // Check if HEAD exists (repo might have no commits yet)
  try {
    await execFileAsync("git", ["rev-parse", "--verify", "HEAD"])
  } catch {
    throw new Error(
      "Cannot analyze: this repository has no commits yet.\n" +
      "Make at least one commit before running crev with --analyze."
    )
  }

  // Produce synthetic diff headers from the file list so
  // extractChangedFiles() and filterDiff() still work.
  // Reviewers will read the actual files directly from the filesystem.
  const { stdout } = await execFileAsync("git", ["ls-tree", "-r", "--name-only", "HEAD"])
  const files = stdout.trim().split("\n").filter(Boolean)
  return files.map((f) => `diff --git a/${f} b/${f}`).join("\n")
}

async function getTypeDiff(type: "all" | "committed" | "uncommitted"): Promise<string> {
  if (type === "uncommitted") {
    const { stdout } = await execFileAsync("git", ["diff"], { maxBuffer: MAX_BUFFER })
    return stdout
  }

  if (type === "committed") {
    try {
      const { stdout } = await execFileAsync("git", ["diff", "HEAD~1..HEAD"], { maxBuffer: MAX_BUFFER })
      return stdout
    } catch {
      // Initial commit — no HEAD~1, show the initial commit as a full diff
      const { stdout } = await execFileAsync("git", ["diff-tree", "-p", "--root", "HEAD"], { maxBuffer: MAX_BUFFER })
      return stdout
    }
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

export function matchesGlob(filePath: string, pattern: string): boolean {
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
