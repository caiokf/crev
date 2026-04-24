import { describe, expect, it } from "vitest"
import { renderDoctor } from "./doctor.js"
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
