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

  it("forwards runtimeConfig.command to overrides", async () => {
    const execute = vi.fn().mockResolvedValue({ raw: "", durationMs: 1, exitCode: 0 })
    valetMocks.getRuntime.mockReturnValue({ execute })

    await callLlm({
      taskName: "Test",
      runtime: "claude",
      model: "opus",
      prompt: "",
      runtimeConfig: { command: "/usr/local/bin/custom-claude" },
    })

    expect(execute.mock.calls[0][0].overrides.command).toBe("/usr/local/bin/custom-claude")
  })

  it("forwards runtimeConfig.env to overrides", async () => {
    const execute = vi.fn().mockResolvedValue({ raw: "", durationMs: 1, exitCode: 0 })
    valetMocks.getRuntime.mockReturnValue({ execute })

    await callLlm({
      taskName: "Test",
      runtime: "claude",
      model: "opus",
      prompt: "",
      runtimeConfig: { env: { ANTHROPIC_API_KEY: "sk-test" } },
    })

    expect(execute.mock.calls[0][0].overrides.env).toEqual({ ANTHROPIC_API_KEY: "sk-test" })
  })

  it("merges runtimeConfig.args before extraArgs", async () => {
    const execute = vi.fn().mockResolvedValue({ raw: "", durationMs: 1, exitCode: 0 })
    valetMocks.getRuntime.mockReturnValue({ execute })

    await callLlm({
      taskName: "Test",
      runtime: "claude",
      model: "opus",
      prompt: "",
      runtimeConfig: { args: ["--timeout", "30"] },
      extraArgs: ["--max-turns", "1"],
    })

    expect(execute.mock.calls[0][0].overrides.extraArgs).toEqual([
      "--timeout", "30", "--max-turns", "1",
    ])
  })

  it("omits overrides when runtimeConfig has empty env and args and no command", async () => {
    const execute = vi.fn().mockResolvedValue({ raw: "", durationMs: 1, exitCode: 0 })
    valetMocks.getRuntime.mockReturnValue({ execute })

    await callLlm({
      taskName: "Test",
      runtime: "claude",
      model: "opus",
      prompt: "",
      runtimeConfig: { env: {}, args: [] },
    })

    expect(execute.mock.calls[0][0].overrides).toBeUndefined()
  })

  it("forwards all runtimeConfig fields together with merged args", async () => {
    const execute = vi.fn().mockResolvedValue({ raw: "", durationMs: 1, exitCode: 0 })
    valetMocks.getRuntime.mockReturnValue({ execute })

    await callLlm({
      taskName: "Test",
      runtime: "claude",
      model: "opus",
      prompt: "",
      runtimeConfig: { command: "/bin/agent", env: { KEY: "val" }, args: ["--a"] },
      extraArgs: ["--b"],
    })

    expect(execute.mock.calls[0][0].overrides).toEqual({
      command: "/bin/agent",
      env: { KEY: "val" },
      extraArgs: ["--a", "--b"],
    })
  })
})
