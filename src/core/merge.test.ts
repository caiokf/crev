import { describe, expect, it } from "vitest"
import { deepMerge, annotatedMerge } from "./merge.js"

describe("deepMerge", () => {
  it("merges flat objects", () => {
    const result = deepMerge({ a: 1 }, { b: 2 })
    expect(result).toEqual({ a: 1, b: 2 })
  })

  it("later values overwrite earlier scalars", () => {
    const result = deepMerge({ a: 1 }, { a: 2 })
    expect(result).toEqual({ a: 2 })
  })

  it("deeply merges nested objects", () => {
    const result = deepMerge(
      { defaults: { schema: "quick", base: "main" } },
      { defaults: { base: "develop" } },
    )
    expect(result).toEqual({ defaults: { schema: "quick", base: "develop" } })
  })

  it("arrays replace, not concatenate", () => {
    const result = deepMerge(
      { diff: { exclude: ["*.lock", "*.snap"] } },
      { diff: { exclude: ["*.md"] } },
    )
    expect(result).toEqual({ diff: { exclude: ["*.md"] } })
  })

  it("merges three layers correctly", () => {
    const result = deepMerge(
      { aliases: { fast: "haiku" }, defaults: { base: "main" } },
      { aliases: { thorough: "opus" }, defaults: { schema: "standard" } },
      { aliases: { fast: "sonnet" } },
    )
    expect(result).toEqual({
      aliases: { fast: "sonnet", thorough: "opus" },
      defaults: { base: "main", schema: "standard" },
    })
  })

  it("new keys in overlay are added", () => {
    const result = deepMerge(
      { runtimes: {} },
      { runtimes: { claude: { env: { KEY: "val" } } } },
    )
    expect(result).toEqual({ runtimes: { claude: { env: { KEY: "val" } } } })
  })

  it("handles empty objects gracefully", () => {
    const result = deepMerge({}, { a: 1 }, {})
    expect(result).toEqual({ a: 1 })
  })
})

describe("annotatedMerge", () => {
  it("tracks provenance of each leaf value", () => {
    const { merged, provenance } = annotatedMerge([
      { label: "user", data: { aliases: { fast: "haiku" } } },
      { label: "project", data: { aliases: { fast: "sonnet" }, defaults: { base: "develop" } } },
    ])

    expect(merged).toEqual({
      aliases: { fast: "sonnet" },
      defaults: { base: "develop" },
    })
    expect(provenance["aliases.fast"]).toBe("project")
    expect(provenance["defaults.base"]).toBe("project")
  })

  it("higher priority layer overrides provenance", () => {
    const { provenance } = annotatedMerge([
      { label: "~/.crev/config.yaml", data: { defaults: { base: "main", schema: "quick" } } },
      { label: ".crev/config.yaml", data: { defaults: { base: "develop" } } },
      { label: ".crev/config.local.yaml", data: { defaults: { base: "feature" } } },
    ])

    expect(provenance["defaults.base"]).toBe(".crev/config.local.yaml")
    expect(provenance["defaults.schema"]).toBe("~/.crev/config.yaml")
  })

  it("tracks array provenance at container level", () => {
    const { provenance } = annotatedMerge([
      { label: "project", data: { diff: { exclude: ["*.lock"] } } },
      { label: "local", data: { diff: { exclude: ["*.md"] } } },
    ])

    expect(provenance["diff.exclude"]).toBe("local")
  })
})
