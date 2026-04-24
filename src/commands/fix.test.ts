import { describe, expect, it } from "vitest"
import { COMMAND_DESCRIPTIONS, GENERAL_HELP_COMMANDS, HELP_COMMAND_ORDER } from "./metadata.js"

describe("fix command metadata", () => {
  it("has a description in COMMAND_DESCRIPTIONS", () => {
    expect(COMMAND_DESCRIPTIONS.fix).toBeDefined()
    expect(COMMAND_DESCRIPTIONS.fix).toContain("fix")
  })

  it("is included in HELP_COMMAND_ORDER", () => {
    expect(HELP_COMMAND_ORDER).toContain("fix")
  })

  it("is listed in GENERAL_HELP_COMMANDS", () => {
    const fixEntry = GENERAL_HELP_COMMANDS.find((c) => c.usage.includes("crev fix"))
    expect(fixEntry).toBeDefined()
    expect(fixEntry!.description).toBe(COMMAND_DESCRIPTIONS.fix)
  })

  it("fix comes after verify in help order", () => {
    const verifyIdx = HELP_COMMAND_ORDER.indexOf("verify")
    const fixIdx = HELP_COMMAND_ORDER.indexOf("fix")
    expect(fixIdx).toBe(verifyIdx + 1)
  })
})
