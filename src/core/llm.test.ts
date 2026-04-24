import { describe, expect, it, vi } from "vitest"
import { callLlm } from "./llm.js"

const valetMocks = vi.hoisted(() => ({
  getRuntime: vi.fn(),
}))

vi.mock("@caiokf/valet", () => ({
  getRuntime: valetMocks.getRuntime,
}))

describe("callLlm", () => {
  it("forwards the AbortSignal to the runtime's execute call", async () => {
    const controller = new AbortController()
    const execute = vi.fn().mockResolvedValue({
      raw: '{"ok": true}',
      durationMs: 5,
      exitCode: 0,
    })
    valetMocks.getRuntime.mockReturnValue({ execute })

    await callLlm({
      taskName: "Test",
      runtime: "claude",
      model: "opus",
      prompt: "hello",
      signal: controller.signal,
    })

    expect(execute).toHaveBeenCalledTimes(1)
    expect(execute.mock.calls[0][0].signal).toBe(controller.signal)
  })

  it("omits signal when none is provided", async () => {
    const execute = vi.fn().mockResolvedValue({
      raw: "",
      durationMs: 1,
      exitCode: 0,
    })
    valetMocks.getRuntime.mockReturnValue({ execute })

    await callLlm({ taskName: "Test", runtime: "claude", model: "opus", prompt: "" })

    expect(execute.mock.calls[0][0].signal).toBeUndefined()
  })

  it("returns the raw output from the runtime", async () => {
    const execute = vi.fn().mockResolvedValue({
      raw: "hello world",
      durationMs: 1,
      exitCode: 0,
    })
    valetMocks.getRuntime.mockReturnValue({ execute })

    const result = await callLlm({
      taskName: "Test",
      runtime: "claude",
      model: "opus",
      prompt: "greet",
    })

    expect(result).toBe("hello world")
  })

  it("propagates errors thrown by the runtime", async () => {
    const execute = vi.fn().mockRejectedValue(new Error("boom"))
    valetMocks.getRuntime.mockReturnValue({ execute })

    await expect(
      callLlm({ taskName: "Test", runtime: "claude", model: "opus", prompt: "" }),
    ).rejects.toThrow("boom")
  })

  it("forwards extraArgs to the runtime overrides", async () => {
    const execute = vi.fn().mockResolvedValue({
      raw: "",
      durationMs: 1,
      exitCode: 0,
    })
    valetMocks.getRuntime.mockReturnValue({ execute })

    await callLlm({
      taskName: "Test",
      runtime: "claude",
      model: "opus",
      prompt: "hello",
      extraArgs: ["--max-turns", "3"],
    })

    expect(execute.mock.calls[0][0].overrides).toEqual({ extraArgs: ["--max-turns", "3"] })
  })

  it("omits overrides when extraArgs is not provided", async () => {
    const execute = vi.fn().mockResolvedValue({
      raw: "",
      durationMs: 1,
      exitCode: 0,
    })
    valetMocks.getRuntime.mockReturnValue({ execute })

    await callLlm({ taskName: "Test", runtime: "claude", model: "opus", prompt: "" })

    expect(execute.mock.calls[0][0].overrides).toBeUndefined()
  })
})
