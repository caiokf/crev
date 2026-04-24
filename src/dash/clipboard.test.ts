import { describe, expect, it } from "vitest"
import { buildOsc52Escape, pickNativeCommand } from "./clipboard.js"

describe("pickNativeCommand", () => {
  it("picks pbcopy on macOS regardless of env", () => {
    expect(pickNativeCommand("darwin", {})).toEqual({ cmd: "pbcopy", args: [] })
  })

  it("picks clip.exe on Windows", () => {
    expect(pickNativeCommand("win32", {})).toEqual({ cmd: "clip", args: [] })
  })

  it("prefers wl-copy when WAYLAND_DISPLAY is set on linux", () => {
    const out = pickNativeCommand("linux", { WAYLAND_DISPLAY: "wayland-0" })
    expect(out).toEqual({ cmd: "wl-copy", args: [] })
  })

  it("falls back to xclip on X11 linux", () => {
    const out = pickNativeCommand("linux", { DISPLAY: ":0" })
    expect(out).toEqual({ cmd: "xclip", args: ["-selection", "clipboard"] })
  })

  it("prefers Wayland over X11 when both are set (matches compositor default)", () => {
    const out = pickNativeCommand("linux", { WAYLAND_DISPLAY: "wayland-0", DISPLAY: ":0" })
    expect(out?.cmd).toBe("wl-copy")
  })

  it("returns null on headless linux (no display env)", () => {
    expect(pickNativeCommand("linux", {})).toBeNull()
  })

  it("returns null on unsupported platforms", () => {
    expect(pickNativeCommand("freebsd" as NodeJS.Platform, {})).toBeNull()
    expect(pickNativeCommand("aix" as NodeJS.Platform, {})).toBeNull()
  })
})

describe("buildOsc52Escape", () => {
  it("wraps a base64 payload with the OSC 52 request prefix and BEL terminator", () => {
    const esc = buildOsc52Escape("hello")
    // eslint-disable-next-line no-control-regex
    expect(esc).toMatch(/^\x1b\]52;c;[A-Za-z0-9+/=]+\x07$/)
    expect(esc).toContain(Buffer.from("hello", "utf8").toString("base64"))
  })

  it("handles unicode via utf-8 base64", () => {
    const esc = buildOsc52Escape("café 🎉")
    expect(esc).toContain(Buffer.from("café 🎉", "utf8").toString("base64"))
  })

  it("encodes empty strings to an empty base64 payload", () => {
    const esc = buildOsc52Escape("")
    expect(esc).toBe("\x1b]52;c;\x07")
  })
})
