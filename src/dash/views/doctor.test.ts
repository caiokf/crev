import { describe, expect, it, vi } from "vitest"
import { renderDoctor, buildDoctorRows, type DoctorRow } from "./doctor.js"
import type { DoctorSnapshot } from "../../actions/doctor.js"
import type { RuntimeHealth } from "@caiokf/valet"

function health(overrides: Partial<RuntimeHealth>): RuntimeHealth {
  return {
    name: "claude",
    command: "claude",
    installed: true,
    version: "1.2.3",
    authenticated: "yes",
    authDetail: "",
    error: null,
    ...overrides,
  }
}

function snapshot(overrides: Partial<DoctorSnapshot> = {}): DoctorSnapshot {
  return {
    crevDir: "/repo/.crev",
    runtimes: [],
    runtimeUsage: new Map(),
    schemaReadiness: [],
    projectChecks: [],
    skills: [],
    ...overrides,
  }
}

describe("doctor · renderDoctor", () => {
  it("renders runtimes with installed/version/auth columns", () => {
    const out = renderDoctor(
      snapshot({
        runtimes: [
          health({ name: "claude", version: "2.1.98", authenticated: "yes" }),
          health({ name: "codex", installed: false, version: null, authenticated: "no", authDetail: "env: OPENAI_API_KEY" }),
        ],
        projectChecks: [{ name: ".crev/config.yaml", ok: true, detail: "valid" }],
      }),
    )
    expect(out).toContain("runtimes")
    expect(out).toContain("claude")
    expect(out).toContain("2.1.98")
    expect(out).toContain("✓ installed")
    expect(out).toContain("✓ auth'd")
    expect(out).toContain("codex")
    expect(out).toContain("✗ not found")
    expect(out).toContain("✗ no auth")
  })

  it("sanitizes noisy version strings", () => {
    const out = renderDoctor(
      snapshot({
        runtimes: [health({ name: "mastracode", version: "Foo bar\nversion 0.23.0 (beta)" })],
        projectChecks: [{ name: ".crev/config.yaml", ok: true, detail: "valid" }],
      }),
    )
    expect(out).toContain("0.23.0")
    expect(out).not.toContain("Foo bar")
  })

  it("shows schema readiness with issues when not ready", () => {
    const out = renderDoctor(
      snapshot({
        runtimes: [health({})],
        schemaReadiness: [
          { name: "quick", ready: true, issues: [] },
          { name: "broken", ready: false, issues: ["claude: not authenticated"] },
        ],
        projectChecks: [{ name: ".crev/config.yaml", ok: true, detail: "valid" }],
      }),
    )
    expect(out).toContain("schemas")
    expect(out).toContain("quick")
    expect(out).toContain("✓ ready")
    expect(out).toContain("broken")
    expect(out).toContain("✗ not ready")
    expect(out).toContain("claude: not authenticated")
  })

  it("renders project checks with icons and details", () => {
    const out = renderDoctor(
      snapshot({
        projectChecks: [
          { name: ".crev/config.yaml", ok: true, detail: "valid" },
          { name: ".crev/reviews/", ok: false, detail: "missing" },
        ],
      }),
    )
    expect(out).toContain("project setup")
    expect(out).toContain(".crev/config.yaml")
    expect(out).toContain("valid")
    expect(out).toContain(".crev/reviews/")
    expect(out).toContain("missing")
  })

  it("renders skills and flags outdated ones", () => {
    const out = renderDoctor(
      snapshot({
        projectChecks: [{ name: ".crev/config.yaml", ok: true, detail: "valid" }],
        skills: [
          { tool: "claude-code", id: "crev", upToDate: true },
          { tool: "cursor", id: "crev", upToDate: false },
        ],
      }),
    )
    expect(out).toContain("skills")
    expect(out).toContain("claude-code")
    expect(out).toContain("✓ up to date")
    expect(out).toContain("cursor")
    expect(out).toContain("⚠ outdated")
    expect(out).toContain("crev update")
  })

  it("omits schema and skills sections when empty", () => {
    const out = renderDoctor(
      snapshot({
        runtimes: [health({})],
        projectChecks: [{ name: ".crev/config.yaml", ok: true, detail: "valid" }],
      }),
    )
    expect(out).not.toContain("❯ schemas")
    expect(out).not.toContain("❯ skills")
  })

  it("surfaces auth-fix hints for unauthenticated runtimes", () => {
    const out = renderDoctor(
      snapshot({
        runtimes: [
          health({
            name: "codex",
            authenticated: "no",
            authDetail: "Set OPENAI_API_KEY in your environment",
          }),
        ],
        projectChecks: [{ name: ".crev/config.yaml", ok: true, detail: "valid" }],
      }),
    )
    expect(out).toContain("fix codex")
    expect(out).toContain("Set OPENAI_API_KEY")
  })

  it("handles the empty-runtimes edge case", () => {
    const out = renderDoctor(
      snapshot({
        projectChecks: [{ name: ".crev/config.yaml", ok: true, detail: "valid" }],
      }),
    )
    expect(out).toContain("no runtimes to check")
  })
})

describe("doctor · buildDoctorRows", () => {
  it("returns DoctorRow objects with text property", () => {
    const rows = buildDoctorRows(
      snapshot({
        runtimes: [health({})],
        projectChecks: [{ name: ".crev/config.yaml", ok: true, detail: "valid" }],
      }),
    )
    expect(rows.length).toBeGreaterThan(0)
    for (const row of rows) {
      expect(row).toHaveProperty("text")
    }
  })

  it("marks passing project checks as non-fixable", () => {
    const rows = buildDoctorRows(
      snapshot({
        projectChecks: [{ name: ".crev/config.yaml", ok: true, detail: "valid" }],
      }),
    )
    const configRow = rows.find((r) => r.text.includes(".crev/config.yaml"))
    expect(configRow).toBeDefined()
    expect(configRow!.fix).toBeUndefined()
  })

  it("attaches fix action to missing config.yaml", () => {
    const rows = buildDoctorRows(
      snapshot({
        projectChecks: [{ name: ".crev/config.yaml", ok: false, detail: "missing" }],
      }),
    )
    const configRow = rows.find((r) => r.text.includes(".crev/config.yaml"))
    expect(configRow).toBeDefined()
    expect(configRow!.fix).toBeDefined()
    expect(configRow!.fix!.label).toBe("create config.yaml")
  })

  it("attaches fix action to missing schemas directory", () => {
    const rows = buildDoctorRows(
      snapshot({
        projectChecks: [
          { name: ".crev/config.yaml", ok: true, detail: "valid" },
          { name: ".crev/schemas/", ok: false, detail: "missing" },
        ],
      }),
    )
    const schemasRow = rows.find((r) => r.text.includes(".crev/schemas/"))
    expect(schemasRow).toBeDefined()
    expect(schemasRow!.fix).toBeDefined()
    expect(schemasRow!.fix!.label).toBe("create schemas directory")
  })

  it("attaches fix action to missing reviews directory", () => {
    const rows = buildDoctorRows(
      snapshot({
        projectChecks: [
          { name: ".crev/config.yaml", ok: true, detail: "valid" },
          { name: ".crev/reviews/", ok: false, detail: "missing" },
        ],
      }),
    )
    const reviewsRow = rows.find((r) => r.text.includes(".crev/reviews/"))
    expect(reviewsRow).toBeDefined()
    expect(reviewsRow!.fix).toBeDefined()
    expect(reviewsRow!.fix!.label).toBe("create reviews directory")
  })

  it("attaches fix action to outdated skills", () => {
    const rows = buildDoctorRows(
      snapshot({
        projectChecks: [{ name: ".crev/config.yaml", ok: true, detail: "valid" }],
        skills: [
          { tool: "cursor", id: "crev", upToDate: false },
        ],
      }),
    )
    const skillRow = rows.find((r) => r.text.includes("cursor") && r.text.includes("outdated"))
    expect(skillRow).toBeDefined()
    expect(skillRow!.fix).toBeDefined()
    expect(skillRow!.fix!.label).toBe("update cursor skill")
  })

  it("does not attach fix to up-to-date skills", () => {
    const rows = buildDoctorRows(
      snapshot({
        projectChecks: [{ name: ".crev/config.yaml", ok: true, detail: "valid" }],
        skills: [
          { tool: "claude-code", id: "crev", upToDate: true },
        ],
      }),
    )
    const skillRow = rows.find((r) => r.text.includes("claude-code"))
    expect(skillRow).toBeDefined()
    expect(skillRow!.fix).toBeUndefined()
  })

  it("includes spacer rows between sections", () => {
    const rows = buildDoctorRows(
      snapshot({
        runtimes: [health({})],
        schemaReadiness: [{ name: "quick", ready: true, issues: [] }],
        projectChecks: [{ name: ".crev/config.yaml", ok: true, detail: "valid" }],
        skills: [{ tool: "claude-code", id: "crev", upToDate: true }],
      }),
    )
    const spacers = rows.filter((r) => r.text === "")
    expect(spacers.length).toBeGreaterThanOrEqual(2)
  })

  it("renderDoctor produces the same text as joining buildDoctorRows", () => {
    const snap = snapshot({
      runtimes: [health({})],
      projectChecks: [{ name: ".crev/config.yaml", ok: true, detail: "valid" }],
    })
    const rendered = renderDoctor(snap)
    const fromRows = buildDoctorRows(snap).map((r) => r.text).join("\n")
    expect(rendered).toBe(fromRows)
  })
})
