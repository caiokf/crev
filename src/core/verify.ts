import { extractAndParse } from "./json-extract.js"
import { callLlm } from "./llm.js"
import type { ReviewIssue, ReviewResult } from "./types.js"
import { errorMessage } from "../util/cli-errors.js"
import fs from "node:fs"
import path from "node:path"

/** Maximum characters of source file context per issue. */
const MAX_CONTEXT_CHARS = 3_000

/** How many lines of context to include around the referenced line. */
const CONTEXT_LINES = 30

type VerifyInput = {
  result: ReviewResult
  runtime: string
  model: string
  signal?: AbortSignal
  runtimeConfig?: {
    command?: string
    env?: Record<string, string>
    args?: string[]
  }
}

export type VerifyStatus = {
  id: string
  status: "fixed" | "open"
  reasoning: string
}

type VerifyResult = {
  statuses: VerifyStatus[]
  durationMs: number
  summary: { fixed: number; open: number; skipped: number }
}

/**
 * Verify which issues in a review are still present in the codebase.
 * Reads the current source files, sends issue + context to an LLM,
 * and returns per-issue status updates.
 */
export async function runVerify(input: VerifyInput): Promise<VerifyResult> {
  const start = performance.now()
  const { result, runtime, model, signal } = input

  const openIssues = result.reviews
    .flatMap((r) => r.issues)
    .filter((i) => !i.status || i.status === "open")

  if (openIssues.length === 0) {
    return {
      statuses: [],
      durationMs: performance.now() - start,
      summary: { fixed: 0, open: 0, skipped: 0 },
    }
  }

  const issuesWithContext = openIssues.map((issue) => ({
    id: issue.id,
    title: issue.title,
    description: issue.description,
    file: issue.file,
    line: issue.line,
    severity: issue.severity,
    category: issue.category,
    currentCode: issue.file ? readFileContext(issue.file, issue.line) : null,
  }))

  const prompt = buildVerifyPrompt(issuesWithContext)
  const statuses = await callVerifyAgent(prompt, runtime, model, signal, input.runtimeConfig)

  const verified = new Set(statuses.map((s) => s.id))
  const skipped = openIssues.filter((i) => !verified.has(i.id)).length

  return {
    statuses,
    durationMs: performance.now() - start,
    summary: {
      fixed: statuses.filter((s) => s.status === "fixed").length,
      open: statuses.filter((s) => s.status === "open").length,
      skipped,
    },
  }
}

/**
 * Apply verify results to a review, mutating issue statuses in place.
 */
export function applyVerifyStatuses(
  result: ReviewResult,
  statuses: VerifyStatus[],
): void {
  const statusMap = new Map(statuses.map((s) => [s.id, s]))
  for (const review of result.reviews) {
    for (const issue of review.issues) {
      const status = statusMap.get(issue.id)
      if (status) {
        issue.status = status.status
      }
    }
  }
}

/**
 * Read a file and extract lines around the referenced line number.
 */
export function readFileContext(
  filePath: string,
  line?: number,
): string | null {
  const resolved = path.resolve(filePath)
  if (!fs.existsSync(resolved)) return null

  try {
    const content = fs.readFileSync(resolved, "utf-8")
    if (!line) return content.slice(0, MAX_CONTEXT_CHARS)

    const lines = content.split("\n")
    const start = Math.max(0, line - CONTEXT_LINES)
    const end = Math.min(lines.length, line + CONTEXT_LINES)
    const slice = lines.slice(start, end)
    const numbered = slice.map((l, i) => {
      const lineNum = start + i + 1
      const marker = lineNum === line ? "→" : " "
      return `${marker}${String(lineNum).padStart(4)} │ ${l}`
    })
    return numbered.join("\n").slice(0, MAX_CONTEXT_CHARS)
  } catch {
    return null
  }
}

type IssueWithContext = {
  id: string
  title: string
  description: string
  file?: string
  line?: number
  severity: string
  category: string
  currentCode: string | null
}

export function buildVerifyPrompt(issues: IssueWithContext[]): string {
  const issueBlocks = issues
    .map((issue) => {
      const loc = issue.file
        ? `File: ${issue.file}${issue.line ? `:${issue.line}` : ""}`
        : "No file reference"

      const code = issue.currentCode
        ? `\nCurrent code:\n\`\`\`\n${issue.currentCode}\n\`\`\``
        : "\n(file not found or no file reference — assume issue is still open)"

      return `### Issue: ${issue.id}
**${issue.title}** (${issue.severity}/${issue.category})
${loc}
${issue.description}
${code}`
    })
    .join("\n\n---\n\n")

  return `You are verifying whether previously-reported code review issues have been fixed.

For each issue below, you are given the original finding and the CURRENT state of the code.
Determine whether the issue has been resolved in the current code.

Rules:
- Mark "fixed" ONLY if the specific problem described is clearly no longer present
- Mark "open" if the issue is still present, if the file was not found, or if you cannot tell
- Do NOT judge whether the fix is good — only whether the reported problem still exists
- If the file is missing or the code context is unavailable, mark as "open"

## Issues to verify (${issues.length} total)

${issueBlocks}

## Response

Respond ONLY with valid JSON:
{
  "verify": [
    {
      "id": "the-issue-id",
      "status": "fixed | open",
      "reasoning": "1 sentence explaining why"
    }
  ]
}`
}

async function callVerifyAgent(
  prompt: string,
  runtime: string,
  model: string,
  signal?: AbortSignal,
  runtimeConfig?: { command?: string; env?: Record<string, string>; args?: string[] },
): Promise<VerifyStatus[]> {
  try {
    const raw = await callLlm({
      taskName: "Verify",
      runtime,
      model,
      prompt,
      signal,
      runtimeConfig,
    })
    return parseVerifyResponse(raw)
  } catch (err) {
    console.error(`Warning: Verify failed (${runtime}/${model}): ${errorMessage(err)}`)
    return []
  }
}

export function parseVerifyResponse(raw: string): VerifyStatus[] {
  const parsed = extractAndParse(raw, "verify")
  if (!parsed || !Array.isArray(parsed.verify)) return []

  return (parsed.verify as unknown[])
    .map((item) => {
      const v = item as Record<string, unknown>
      const status = String(v.status ?? "open")
      return {
        id: String(v.id ?? ""),
        status: (status === "fixed" ? "fixed" : "open") as VerifyStatus["status"],
        reasoning: String(v.reasoning ?? ""),
      }
    })
    .filter((v) => v.id)
}
