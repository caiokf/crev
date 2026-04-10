import { beforeEach, describe, expect, it, vi } from "vitest"
import { createClaudeRuntime } from "./claude.js"
import { createCodeRabbitRuntime } from "./coderabbit.js"
import { createCodexRuntime } from "./codex.js"
import { createGeminiRuntime } from "./gemini.js"
import { createKimiRuntime } from "./kimi.js"
import { createOpenCodeRuntime } from "./opencode.js"
import type { RuntimeExecutionRequest } from "./types.js"

const { execAbortableMock, readFileSyncMock } = vi.hoisted(() => ({
  execAbortableMock: vi.fn(),
  readFileSyncMock: vi.fn(),
}))

vi.mock("./exec.js", () => ({
  execAbortable: execAbortableMock,
}))

vi.mock("node:fs", () => ({
  readFileSync: readFileSyncMock,
}))

function buildRequest(overrides: Partial<RuntimeExecutionRequest> = {}): RuntimeExecutionRequest {
  return {
    taskName: "Reviewer",
    model: "default",
    prompt: "Prompt",
    promptFile: "/tmp/prompt.txt",
    outputFormat: '{"issues":[]}',
    ...overrides,
  }
}

describe("runtime adapters", () => {
  beforeEach(() => {
    execAbortableMock.mockReset()
    readFileSyncMock.mockReset()
  })

  it("maps claude model aliases before execution", async () => {
    execAbortableMock.mockResolvedValue({ stdout: "ok", stderr: "" })

    const runtime = createClaudeRuntime()
    const result = await runtime.execute(buildRequest({ model: "opus", signal: new AbortController().signal }))

    expect(execAbortableMock).toHaveBeenCalledWith(
      "claude",
      ["--print", "--model", "claude-opus-4-6"],
      expect.objectContaining({
        stdin: "Read and follow the instructions in this file: /tmp/prompt.txt",
      }),
    )
    expect(result.raw).toBe("ok")
    expect(result.exitCode).toBe(0)
  })

  it("omits codex model flag when the default alias is requested", async () => {
    execAbortableMock.mockResolvedValue({ stdout: "ok", stderr: "" })

    const runtime = createCodexRuntime()
    await runtime.execute(buildRequest({ model: "default" }))

    expect(execAbortableMock).toHaveBeenCalledWith(
      "codex",
      ["exec", "--full-auto"],
      expect.objectContaining({
        stdin: "Read and follow the instructions in this file: /tmp/prompt.txt",
      }),
    )
  })

  it("adds codex model flag for explicit models", async () => {
    execAbortableMock.mockResolvedValue({ stdout: "ok", stderr: "" })

    const runtime = createCodexRuntime()
    await runtime.execute(buildRequest({ model: "gpt-5.4" }))

    expect(execAbortableMock).toHaveBeenCalledWith(
      "codex",
      ["exec", "--full-auto", "-m", "gpt-5.4"],
      expect.any(Object),
    )
  })

  it("passes prompt file contents to gemini", async () => {
    readFileSyncMock.mockReturnValue("full prompt")
    execAbortableMock.mockResolvedValue({ stdout: "gemini-output", stderr: "" })

    const runtime = createGeminiRuntime()
    const result = await runtime.execute(buildRequest({ model: "gemini-2.5-flash" }))

    expect(readFileSyncMock).toHaveBeenCalledWith("/tmp/prompt.txt", "utf-8")
    expect(execAbortableMock).toHaveBeenCalledWith(
      "gemini",
      ["-m", "gemini-2.5-flash"],
      expect.objectContaining({ stdin: "full prompt" }),
    )
    expect(result.raw).toBe("gemini-output")
  })

  it("passes prompt file contents to kimi", async () => {
    readFileSyncMock.mockReturnValue("full prompt")
    execAbortableMock.mockResolvedValue({ stdout: "kimi-output", stderr: "" })

    const runtime = createKimiRuntime()
    const result = await runtime.execute(buildRequest({ model: "kimi-k2.5" }))

    expect(readFileSyncMock).toHaveBeenCalledWith("/tmp/prompt.txt", "utf-8")
    expect(execAbortableMock).toHaveBeenCalledWith(
      "kimi",
      ["--print"],
      expect.objectContaining({ stdin: "full prompt" }),
    )
    expect(result.raw).toBe("kimi-output")
  })

  it("passes diff flags through to coderabbit", async () => {
    execAbortableMock.mockResolvedValue({ stdout: "review", stderr: "" })

    const runtime = createCodeRabbitRuntime()
    await runtime.execute(
      buildRequest({
        diff: {
          diffContent: "diff",
          diffFile: "/tmp/diff.txt",
          type: "committed",
          base: "main",
          baseCommit: "abc123",
        },
      }),
    )

    expect(execAbortableMock).toHaveBeenCalledWith(
      "cr",
      ["review", "--prompt-only", "--type", "committed", "--base", "main", "--base-commit", "abc123"],
      expect.any(Object),
    )
  })

  it("parses opencode text events into a single response", async () => {
    execAbortableMock.mockResolvedValue({
      stdout: '{"type":"text","part":{"text":"hello "}}\n{"type":"text","part":{"text":"world"}}\n',
      stderr: "",
    })

    const runtime = createOpenCodeRuntime()
    const result = await runtime.execute(buildRequest({ model: "zai/glm-5" }))

    expect(execAbortableMock).toHaveBeenCalledWith(
      "expect",
      [
        "-c",
        'set f [open "/tmp/prompt.txt" r]; set prompt [read $f]; close $f; spawn opencode run --format json -m zai/glm-5 $prompt; set timeout 600; expect eof',
      ],
      expect.any(Object),
    )
    expect(result.raw).toBe("hello world")
    expect(result.exitCode).toBe(0)
  })

  it("returns parsed opencode API errors as failures", async () => {
    execAbortableMock.mockResolvedValue({
      stdout: '{"type":"error","error":{"data":{"message":"rate limited"}}}\n',
      stderr: "",
    })

    const runtime = createOpenCodeRuntime()
    const result = await runtime.execute(buildRequest())

    expect(result.raw).toBe("OpenCode error: rate limited")
    expect(result.exitCode).toBe(1)
  })

  it("uses captured stdout when an adapter command fails", async () => {
    execAbortableMock.mockRejectedValue(Object.assign(new Error("boom"), { stdout: "partial output", code: 9 }))

    const runtime = createClaudeRuntime()
    const result = await runtime.execute(buildRequest())

    expect(result.raw).toBe("partial output")
    expect(result.exitCode).toBe(9)
  })
})
