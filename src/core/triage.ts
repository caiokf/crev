import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { getRuntime } from "@caiokf/valet"
import type { Config } from "./config.js"
import { extractJsonObject } from "./json-extract.js"
import type { ReviewIssue } from "./types.js"

type TriageInput = {
  issues: ReviewIssue[]
  diffContent: string
  diffType?: string
  config: Config
}

type TriageResult = {
  triaged: ReviewIssue[]
  durationMs: number
  summary: {
    actionable: number
    deferred: number
    dismissed: number
  }
}

export async function runTriage(input: TriageInput): Promise<TriageResult> {
  const start = performance.now()
  const { issues, diffContent, diffType, config } = input

  if (issues.length === 0) {
    return {
      triaged: [],
      durationMs: performance.now() - start,
      summary: { actionable: 0, deferred: 0, dismissed: 0 },
    }
  }

  const prompt = buildTriagePrompt(issues, diffContent, config.triage.prompt, diffType)
  const verdicts = await callTriageAgent(prompt, config)

  const triaged = issues.map((issue) => {
    const verdict = verdicts.find((v) => v.id === issue.id)
    if (verdict) {
      return { ...issue, triage: { verdict: verdict.verdict, reasoning: verdict.reasoning } }
    }
    return {
      ...issue,
      triage: { verdict: "actionable" as const, reasoning: "No triage verdict returned." },
    }
  })

  const summary = {
    actionable: triaged.filter((i) => i.triage?.verdict === "actionable").length,
    deferred: triaged.filter((i) => i.triage?.verdict === "deferred").length,
    dismissed: triaged.filter((i) => i.triage?.verdict === "dismissed").length,
  }

  return {
    triaged,
    durationMs: performance.now() - start,
    summary,
  }
}

export function buildTriagePrompt(
  issues: ReviewIssue[],
  diffContent: string,
  triageInstructions: string,
  diffType?: string,
): string {
  const issuesSummary = issues.map((issue) => ({
    id: issue.id,
    reviewer: issue.reviewer,
    severity: issue.severity,
    category: issue.category,
    file: issue.file,
    line: issue.line,
    title: issue.title,
    description: issue.description,
  }))

  return `${triageInstructions}

${diffType === "analyze"
    ? `## Scope\nThis is a full codebase analysis, not a diff review. The issues below reference files in the repository.`
    : `## The diff being reviewed\n\`\`\`diff\n${diffContent.slice(0, 80_000)}\n\`\`\``}

## Issues found by reviewers (${issues.length} total)
${JSON.stringify(issuesSummary, null, 2)}

## Your task
For EACH issue above, respond with your verdict. Push back hard — only mark something "actionable" if it's a genuine problem that should be fixed in THIS change.

Respond ONLY with valid JSON matching this exact schema:
{
  "triage": [
    {
      "id": "the-issue-id",
      "verdict": "actionable | deferred | dismissed",
      "reasoning": "1-2 sentences explaining your position"
    }
  ]
}`
}

type RawTriageVerdict = {
  id: string
  verdict: "actionable" | "deferred" | "dismissed"
  reasoning: string
}

async function callTriageAgent(prompt: string, config: Config): Promise<RawTriageVerdict[]> {
  const { runtime, model } = config.triage
  const promptFile = path.join(os.tmpdir(), `crev-prompt-triage-${process.pid}.txt`)
  fs.writeFileSync(promptFile, prompt, "utf-8")

  try {
    const rt = getRuntime(runtime)
    const result = await rt.execute({
      taskName: "Triage",
      model,
      prompt,
      promptFile,
      diff: { diffContent: "", diffFile: "", type: "all" },
      outputFormat: "",
    })

    return parseTriageResponse(result.raw)
  } catch (err) {
    console.error(`Warning: Triage failed (${runtime}/${model}): ${err instanceof Error ? err.message : String(err)}`)
    return []
  } finally {
    try {
      fs.unlinkSync(promptFile)
    } catch {
      // Best-effort cleanup
    }
  }
}

export function parseTriageResponse(raw: string): RawTriageVerdict[] {
  const jsonStr = extractJsonObject(raw, "triage")
  if (!jsonStr) return []

  try {
    const parsed = JSON.parse(jsonStr) as { triage?: unknown[] }
    if (!Array.isArray(parsed.triage)) return []

    const validVerdicts = new Set(["actionable", "deferred", "dismissed"])

    return parsed.triage
      .map((item) => {
        const v = item as Record<string, unknown>
        const verdict = String(v.verdict ?? "actionable")
        return {
          id: String(v.id ?? ""),
          verdict: (validVerdicts.has(verdict) ? verdict : "actionable") as RawTriageVerdict["verdict"],
          reasoning: String(v.reasoning ?? ""),
        }
      })
      .filter((v) => v.id)
  } catch {
    return []
  }
}
