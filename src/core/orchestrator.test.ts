import { describe, expect, it, vi, beforeEach, afterEach } from "vitest"
import fs from "node:fs"
import path from "node:path"
import os from "node:os"
import { extractChangedFiles, buildCodebaseReference, buildDiffReference } from "./orchestrator.js"

describe("extractChangedFiles", () => {
  it("extracts file paths from standard git diff", () => {
    const diff = `diff --git a/packages/cli/src/commands/init.ts b/packages/cli/src/commands/init.ts
index abc123..def456 100644
--- a/packages/cli/src/commands/init.ts
+++ b/packages/cli/src/commands/init.ts
@@ -1,5 +1,6 @@
+import something
 existing code
diff --git a/packages/cli/src/core/schema.ts b/packages/cli/src/core/schema.ts
index 111222..333444 100644
--- a/packages/cli/src/core/schema.ts
+++ b/packages/cli/src/core/schema.ts
@@ -10,3 +10,4 @@
+new line`
    const files = extractChangedFiles(diff)
    expect(files).toEqual([
      "packages/cli/src/commands/init.ts",
      "packages/cli/src/core/schema.ts",
    ])
  })

  it("deduplicates renamed files", () => {
    const diff = `diff --git a/old.ts b/new.ts
similarity index 90%
rename from old.ts
rename to new.ts
diff --git a/old.ts b/old.ts
deleted file mode 100644`
    const files = extractChangedFiles(diff)
    expect(files).toContain("old.ts")
  })

  it("returns empty array for empty diff", () => {
    expect(extractChangedFiles("")).toEqual([])
  })

  it("returns empty array for diff with no file headers", () => {
    expect(extractChangedFiles("just some random text\n")).toEqual([])
  })

  it("handles paths with spaces", () => {
    const diff = `diff --git a/my dir/file.ts b/my dir/file.ts`
    const files = extractChangedFiles(diff)
    expect(files).toEqual(["my dir/file.ts"])
  })
})

describe("buildDiffReference", () => {
  it("includes the diff file path", () => {
    const ref = buildDiffReference("/tmp/some-diff.diff")
    expect(ref).toContain("/tmp/some-diff.diff")
    expect(ref).toContain("Read the diff from that file path")
  })
})

describe("buildCodebaseReference", () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "crev-test-"))
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it("always includes the diff file reference", () => {
    const diff = {
      diffContent: "",
      diffFile: "/tmp/test.diff",
      type: "all" as const,
    }
    const result = buildCodebaseReference(diff)
    expect(result).toContain("/tmp/test.diff")
    expect(result).toContain("Read the diff file above")
  })

  it("inlines full source of changed files that exist", () => {
    const filePath = path.join(tmpDir, "test.ts")
    fs.writeFileSync(filePath, "const x = 1;\n", "utf-8")

    const diff = {
      diffContent: `diff --git a/${filePath} b/${filePath}\n+const x = 1;`,
      diffFile: "/tmp/test.diff",
      type: "all" as const,
    }
    const result = buildCodebaseReference(diff)
    expect(result).toContain("const x = 1;")
    expect(result).toContain(`--- ${filePath} ---`)
  })

  it("skips files that do not exist on disk", () => {
    const diff = {
      diffContent: `diff --git a/nonexistent/file.ts b/nonexistent/file.ts\n+code`,
      diffFile: "/tmp/test.diff",
      type: "all" as const,
    }
    const result = buildCodebaseReference(diff)
    expect(result).not.toContain("--- nonexistent/file.ts ---")
    expect(result).toContain("/tmp/test.diff")
  })

  it("includes diff reference even when no source files found", () => {
    const diff = {
      diffContent: `diff --git a/gone.ts b/gone.ts\n+code`,
      diffFile: "/tmp/test.diff",
      type: "all" as const,
    }
    const result = buildCodebaseReference(diff)
    expect(result).toContain("/tmp/test.diff")
    expect(result).toContain("Read the diff file above")
  })

  it("preserves exact file paths in section headers", () => {
    const filePath = path.join(tmpDir, "src", "deep", "file.ts")
    fs.mkdirSync(path.dirname(filePath), { recursive: true })
    fs.writeFileSync(filePath, "export default 42;\n", "utf-8")

    const relativePath = filePath
    const diff = {
      diffContent: `diff --git a/${relativePath} b/${relativePath}\n+export default 42;`,
      diffFile: "/tmp/test.diff",
      type: "all" as const,
    }
    const result = buildCodebaseReference(diff)
    expect(result).toContain(`--- ${relativePath} ---`)
  })
})
