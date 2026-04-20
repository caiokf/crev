import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { loadLayeredConfig, loadAnnotatedConfig } from "./config.js"

describe("loadLayeredConfig", () => {
  let tmpDir: string
  let originalHome: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "crev-layered-"))
    originalHome = process.env.HOME ?? ""
    // Point HOME to tmpDir so getUserCrevDir() uses our temp
    process.env.HOME = tmpDir
  })

  afterEach(() => {
    process.env.HOME = originalHome
    fs.rmSync(tmpDir, { recursive: true })
  })

  it("returns defaults when no config files exist", () => {
    const crevDir = path.join(tmpDir, "project", ".crev")
    fs.mkdirSync(crevDir, { recursive: true })

    const config = loadLayeredConfig(crevDir)
    expect(config.defaults.schema).toBe("quick")
    expect(config.defaults.base).toBe("main")
  })

  it("loads project config.yaml only", () => {
    const crevDir = path.join(tmpDir, "project", ".crev")
    fs.mkdirSync(crevDir, { recursive: true })
    fs.writeFileSync(
      path.join(crevDir, "config.yaml"),
      "defaults:\n  base: develop\n",
    )

    const config = loadLayeredConfig(crevDir)
    expect(config.defaults.base).toBe("develop")
    expect(config.defaults.schema).toBe("quick") // default preserved
  })

  it("deep merges user + project configs", () => {
    const userCrevDir = path.join(tmpDir, ".crev")
    fs.mkdirSync(userCrevDir, { recursive: true })
    fs.writeFileSync(
      path.join(userCrevDir, "config.yaml"),
      "aliases:\n  fast: haiku\n  cheap: haiku\n",
    )

    const crevDir = path.join(tmpDir, "project", ".crev")
    fs.mkdirSync(crevDir, { recursive: true })
    fs.writeFileSync(
      path.join(crevDir, "config.yaml"),
      "aliases:\n  fast: sonnet\ndefaults:\n  base: develop\n",
    )

    const config = loadLayeredConfig(crevDir)
    expect(config.aliases.fast).toBe("sonnet") // project wins
    expect(config.aliases.cheap).toBe("haiku") // user preserved
    expect(config.defaults.base).toBe("develop")
  })

  it("local config overrides project and user", () => {
    const userCrevDir = path.join(tmpDir, ".crev")
    fs.mkdirSync(userCrevDir, { recursive: true })
    fs.writeFileSync(
      path.join(userCrevDir, "config.yaml"),
      "defaults:\n  base: main\n  schema: thorough\n",
    )

    const crevDir = path.join(tmpDir, "project", ".crev")
    fs.mkdirSync(crevDir, { recursive: true })
    fs.writeFileSync(
      path.join(crevDir, "config.yaml"),
      "defaults:\n  base: develop\n",
    )
    fs.writeFileSync(
      path.join(crevDir, "config.local.yaml"),
      "defaults:\n  base: my-feature\n",
    )

    const config = loadLayeredConfig(crevDir)
    expect(config.defaults.base).toBe("my-feature") // local wins
    expect(config.defaults.schema).toBe("thorough") // user preserved through merge
  })

  it("arrays replace across layers", () => {
    const crevDir = path.join(tmpDir, "project", ".crev")
    fs.mkdirSync(crevDir, { recursive: true })
    fs.writeFileSync(
      path.join(crevDir, "config.yaml"),
      "diff:\n  exclude:\n    - '*.lock'\n    - '*.snap'\n",
    )
    fs.writeFileSync(
      path.join(crevDir, "config.local.yaml"),
      "diff:\n  exclude:\n    - '*.md'\n",
    )

    const config = loadLayeredConfig(crevDir)
    expect(config.diff.exclude).toEqual(["*.md"])
  })
})

describe("loadAnnotatedConfig", () => {
  let tmpDir: string
  let originalHome: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "crev-annotated-"))
    originalHome = process.env.HOME ?? ""
    process.env.HOME = tmpDir
  })

  afterEach(() => {
    process.env.HOME = originalHome
    fs.rmSync(tmpDir, { recursive: true })
  })

  it("tracks which layer provided each value", () => {
    const userCrevDir = path.join(tmpDir, ".crev")
    fs.mkdirSync(userCrevDir, { recursive: true })
    fs.writeFileSync(
      path.join(userCrevDir, "config.yaml"),
      "defaults:\n  schema: thorough\n",
    )

    const crevDir = path.join(tmpDir, "project", ".crev")
    fs.mkdirSync(crevDir, { recursive: true })
    fs.writeFileSync(
      path.join(crevDir, "config.yaml"),
      "defaults:\n  base: develop\n",
    )

    const { config, provenance } = loadAnnotatedConfig(crevDir)
    expect(config.defaults.schema).toBe("thorough")
    expect(config.defaults.base).toBe("develop")
    expect(provenance["defaults.schema"]).toBe("~/.crev/config.yaml")
    expect(provenance["defaults.base"]).toBe(".crev/config.yaml")
  })
})

