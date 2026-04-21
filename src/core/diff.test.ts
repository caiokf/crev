import { execSync } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { filterDiff, matchesGlob, resolveDiff } from "./diff.js"

function createTempGitRepo(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "crev-test-"))
  execSync("git init", { cwd: dir })
  execSync("git config user.email test@test.com", { cwd: dir })
  execSync("git config user.name Test", { cwd: dir })
  return dir
}

const tempDirs: string[] = []
afterEach(() => {
  for (const dir of tempDirs) {
    fs.rmSync(dir, { recursive: true, force: true })
  }
  tempDirs.length = 0
})

describe("filterDiff", () => {
  const sampleDiff = [
    "diff --git a/src/index.ts b/src/index.ts",
    "--- a/src/index.ts",
    "+++ b/src/index.ts",
    "@@ -1,3 +1,4 @@",
    " import foo",
    "+import bar",
    "diff --git a/pnpm-lock.yaml b/pnpm-lock.yaml",
    "--- a/pnpm-lock.yaml",
    "+++ b/pnpm-lock.yaml",
    "@@ -1,100 +1,200 @@",
    " lockfileVersion: 9",
    "+some change",
    "diff --git a/src/test.snap b/src/test.snap",
    "--- a/src/test.snap",
    "+++ b/src/test.snap",
    "@@ -1 +1 @@",
    "-old snapshot",
    "+new snapshot",
  ].join("\n")

  it("filters out exact filename matches", () => {
    const result = filterDiff(sampleDiff, ["pnpm-lock.yaml"])
    expect(result).toContain("src/index.ts")
    expect(result).not.toContain("pnpm-lock.yaml")
    expect(result).toContain("test.snap")
  })

  it("filters out glob extension patterns", () => {
    const result = filterDiff(sampleDiff, ["*.snap"])
    expect(result).toContain("src/index.ts")
    expect(result).toContain("pnpm-lock.yaml")
    expect(result).not.toContain("test.snap")
  })

  it("filters out recursive glob patterns", () => {
    const result = filterDiff(sampleDiff, ["**/*.snap"])
    expect(result).not.toContain("test.snap")
    expect(result).toContain("src/index.ts")
  })

  it("handles multiple patterns", () => {
    const result = filterDiff(sampleDiff, ["pnpm-lock.yaml", "**/*.snap"])
    expect(result).toContain("src/index.ts")
    expect(result).not.toContain("pnpm-lock.yaml")
    expect(result).not.toContain("test.snap")
  })

  it("returns unchanged diff when no patterns match", () => {
    const result = filterDiff(sampleDiff, ["nonexistent.txt"])
    expect(result).toBe(sampleDiff)
  })
})

describe("matchesGlob", () => {
  it("*.json matches top-level json files", () => {
    expect(matchesGlob("pnpm-lock.json", "*.json")).toBe(true)
  })

  it("*.json does not match non-json files", () => {
    expect(matchesGlob("src/foo.ts", "*.json")).toBe(false)
  })

  it("**/*.snap matches nested snap files", () => {
    expect(matchesGlob("src/__tests__/foo.snap", "**/*.snap")).toBe(true)
    expect(matchesGlob("foo.snap", "**/*.snap")).toBe(true)
  })

  it("**/dist matches dist at any depth", () => {
    expect(matchesGlob("packages/cli/dist", "**/dist")).toBe(true)
    expect(matchesGlob("dist", "**/dist")).toBe(true)
  })

  it("exact filename matches only at top level", () => {
    expect(matchesGlob("README.md", "README.md")).toBe(true)
    expect(matchesGlob("docs/README.md", "README.md")).toBe(true) // ends with /README.md
  })

  it("pattern without wildcards doesn't match unrelated nested paths", () => {
    expect(matchesGlob("src/other.ts", "README.md")).toBe(false)
  })
})

describe("resolveDiff", () => {
  it("analyze fails gracefully on a repo with no commits", async () => {
    const dir = createTempGitRepo()
    tempDirs.push(dir)
    fs.writeFileSync(path.join(dir, "file.txt"), "hello")

    const crevDir = path.join(dir, ".crev")
    fs.mkdirSync(crevDir, { recursive: true })

    const prev = process.cwd()
    process.chdir(dir)
    try {
      await expect(
        resolveDiff({
          slug: "test",
          source: { kind: "local", type: "all" },
          analyze: true,
          crevDir,
        })
      ).rejects.toThrow("no commits")
    } finally {
      process.chdir(prev)
    }
  })

  it("analyze returns synthetic diff headers for all tracked files", async () => {
    const dir = createTempGitRepo()
    tempDirs.push(dir)
    fs.writeFileSync(path.join(dir, "file.txt"), "hello\n")
    fs.mkdirSync(path.join(dir, "src"), { recursive: true })
    fs.writeFileSync(path.join(dir, "src/app.ts"), "export {}\n")
    execSync("git add . && git commit -m init", { cwd: dir })

    const crevDir = path.join(dir, ".crev")
    fs.mkdirSync(crevDir, { recursive: true })

    const prev = process.cwd()
    process.chdir(dir)
    try {
      const result = await resolveDiff({
        slug: "test",
        source: { kind: "local", type: "all" },
        analyze: true,
        crevDir,
      })
      // Should contain synthetic diff headers, not actual diff content
      expect(result.diffContent).toContain("diff --git a/file.txt b/file.txt")
      expect(result.diffContent).toContain("diff --git a/src/app.ts b/src/app.ts")
      // Should NOT contain actual file content (no +lines)
      expect(result.diffContent).not.toContain("+hello")
      expect(result.diffContent).not.toContain("+export")
      // Analyze mode uses "all" as the DiffInput type
      expect(result.type).toBe("all")
    } finally {
      process.chdir(prev)
    }
  })

  it("committed type falls back to empty tree on initial commit", async () => {
    const dir = createTempGitRepo()
    tempDirs.push(dir)
    fs.writeFileSync(path.join(dir, "file.txt"), "hello\n")
    execSync("git add . && git commit -m init", { cwd: dir })

    const crevDir = path.join(dir, ".crev")
    fs.mkdirSync(crevDir, { recursive: true })

    const prev = process.cwd()
    process.chdir(dir)
    try {
      const result = await resolveDiff({
        slug: "test",
        source: { kind: "local", type: "committed" },
        crevDir,
      })
      expect(result.diffContent).toContain("file.txt")
      expect(result.diffContent).toContain("+hello")
    } finally {
      process.chdir(prev)
    }
  })
})
