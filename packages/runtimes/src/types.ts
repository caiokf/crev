export type RuntimeType = "cli" | "api"

export type DiffInput = {
  diffContent: string
  diffFile: string
  base?: string
  baseCommit?: string
  type: "all" | "committed" | "uncommitted"
}

export type RuntimeExecutionRequest = {
  taskName: string
  model: string
  prompt: string
  promptFile: string
  outputFormat?: string
  signal?: AbortSignal
  diff?: DiffInput
}

export type RawExecutionOutput = {
  raw: string
  exitCode: number
  durationMs: number
}

export type RuntimeHealth = {
  name: string
  installed: boolean
  version: string | null
  authenticated: "yes" | "no" | "unknown"
  authDetail: string
  error: string | null
}

export type RuntimeAdapter = {
  type: RuntimeType
  name: string
  models: readonly string[]
  defaultModel: string
  supportsCustomPrompt: boolean
  execute(request: RuntimeExecutionRequest): Promise<RawExecutionOutput>
  healthCheck(): Promise<RuntimeHealth>
}
