import { callLlm } from "./llm.js"
import type { ReviewIssue, ReviewResult } from "./types.js"
import { errorMessage } from "../util/cli-errors.js"

export type FixStatus = {
  id: string
  status: "fixed" | "failed" | "skipped"
  reasoning: string
}

export type FixInput = {
  issues: ReviewIssue[]
  runtime: string
  model: string
  signal?: AbortSignal
  /** Called after each issue finishes. */
  onProgress?: (completed: number, total: number, status: FixStatus) => void
}

export type FixResult = {
  statuses: FixStatus[]
  durationMs: number
  summary: { fixed: number; failed: number; skipped: number }
}

/**
 * Fix issues sequentially by dispatching each to a coding agent.
 * Issues without triage enrichment `promptForAgents` are skipped.
 * Each issue is processed one at a time because fixes mutate the codebase.
 */
export async function runFix(input: FixInput): Promise<FixResult> {
  const start = performance.now()
  const { issues, runtime, model, signal, onProgress } = input

  const statuses: FixStatus[] = []

  for (let i = 0; i < issues.length; i++) {
    const issue = issues[i]
    const prompt = issue.triage?.enrichment?.promptForAgents?.trim()

    if (!prompt) {
      const status: FixStatus = {
        id: issue.id,
        status: "skipped",
        reasoning: "no triage enrichment prompt available",
      }
      statuses.push(status)
      onProgress?.(i + 1, issues.length, status)
      continue
    }

    const fixPrompt = buildFixPrompt(issue, prompt)

    try {
      const raw = await callLlm({
        taskName: `Fix-${issue.id}`,
        runtime,
        model,
        prompt: fixPrompt,
        signal,
      })
      const status = parseFixResponse(raw, issue.id)
      statuses.push(status)
      onProgress?.(i + 1, issues.length, status)
    } catch (err) {
      const status: FixStatus = {
        id: issue.id,
        status: "failed",
        reasoning: `agent error: ${errorMessage(err)}`,
      }
      statuses.push(status)
      onProgress?.(i + 1, issues.length, status)
    }
  }

  return {
    statuses,
    durationMs: performance.now() - start,
    summary: {
      fixed: statuses.filter((s) => s.status === "fixed").length,
      failed: statuses.filter((s) => s.status === "failed").length,
      skipped: statuses.filter((s) => s.status === "skipped").length,
    },
  }
}

/**
 * Apply fix results to a review, mutating issue statuses in place.
 */
export function applyFixStatuses(
  result: ReviewResult,
  statuses: FixStatus[],
): void {
  const statusMap = new Map(statuses.map((s) => [s.id, s]))
  for (const review of result.reviews) {
    for (const issue of review.issues) {
      const status = statusMap.get(issue.id)
      if (status?.status === "fixed") {
        issue.status = "fixed"
      }
    }
  }
}

/**
 * Build the prompt sent to the coding agent for a single issue.
 */
export function buildFixPrompt(issue: ReviewIssue, agentPrompt: string): string {
  const location = issue.file
    ? `File: ${issue.file}${issue.line ? `:${issue.line}` : ""}`
    : "No specific file"

  const enrichment = issue.triage?.enrichment
  const fixHint = enrichment?.minimalFix
    ? `\nSuggested fix: ${enrichment.minimalFix.summary}`
    : ""

  return `You are a coding agent fixing a code review issue. Make the minimal change needed.

## Issue
**${issue.title}** (${issue.severity}/${issue.category})
${location}
${issue.description}
${fixHint}

## Instructions
${agentPrompt}

## After fixing
Once you have made the fix, respond with a JSON block:
\`\`\`json
{
  "fix": {
    "id": "${issue.id}",
    "status": "fixed",
    "reasoning": "brief description of what you changed"
  }
}
\`\`\`

If you cannot fix the issue, respond with:
\`\`\`json
{
  "fix": {
    "id": "${issue.id}",
    "status": "failed",
    "reasoning": "why the fix could not be applied"
  }
}
\`\`\``
}

/**
 * Parse the fix agent's response to extract the status.
 * Falls back to "fixed" if the agent didn't produce structured output
 * (most coding agents will make the fix but not always emit JSON).
 */
export function parseFixResponse(raw: string, issueId: string): FixStatus {
  // Try to extract JSON from the response
  const jsonMatch = raw.match(/\{[\s\S]*?"fix"[\s\S]*?\}[\s\S]*?\}/)
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0])
      if (parsed.fix && typeof parsed.fix === "object") {
        const status = String(parsed.fix.status ?? "fixed")
        return {
          id: issueId,
          status: status === "failed" ? "failed" : "fixed",
          reasoning: String(parsed.fix.reasoning ?? ""),
        }
      }
    } catch { /* fall through */ }
  }

  // If the agent produced output but no JSON, assume it fixed the issue
  // (coding agents typically just make the change without structured output)
  if (raw.trim().length > 0) {
    return {
      id: issueId,
      status: "fixed",
      reasoning: "agent completed without structured response",
    }
  }

  return {
    id: issueId,
    status: "failed",
    reasoning: "agent produced no output",
  }
}
