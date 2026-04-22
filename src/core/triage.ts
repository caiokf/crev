import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { getRuntime } from "@caiokf/valet"
import type { Config } from "./config.js"
import { extractJsonObject } from "./json-extract.js"
import type { ReviewIssue } from "./types.js"
import { uniqueSuffix } from "../util/paths.js"

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

export type TriageFlags = {
  deduplicate: boolean
  recategorize: boolean
}

const VALID_SEVERITIES = new Set(["low", "medium", "high", "critical"])
const VALID_CATEGORIES = new Set(["bug", "security", "performance", "style", "compliance", "architecture"])

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

  const flags: TriageFlags = {
    deduplicate: config.triage.deduplicate,
    recategorize: config.triage.recategorize,
  }

  const prompt = buildTriagePrompt(issues, diffContent, config.triage.prompt, diffType, flags)
  const verdicts = await callTriageAgent(prompt, config)

  // If triage failed (returned no verdicts), return issues unchanged rather than
  // marking everything as "actionable" which would silently inflate the count.
  if (verdicts.length === 0) {
    return {
      triaged: issues,
      durationMs: performance.now() - start,
      summary: { actionable: 0, deferred: 0, dismissed: 0 },
    }
  }

  const triaged = applyTriageVerdicts(issues, verdicts, flags)

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

export function applyTriageVerdicts(
  issues: ReviewIssue[],
  verdicts: RawTriageVerdict[],
  flags: TriageFlags,
): ReviewIssue[] {
  const issueMap = new Map(issues.map((i) => [i.id, i]))

  const triaged = issues.map((issue) => {
    const verdict = verdicts.find((v) => v.id === issue.id)
    if (!verdict) {
      return {
        ...issue,
        triage: { verdict: "actionable" as const, reasoning: "No triage verdict returned." },
      }
    }

    const result = { ...issue }

    // Apply dedup: mark as dismissed if it's a duplicate of another issue
    if (flags.deduplicate && verdict.duplicateOf) {
      const canonical = issueMap.get(verdict.duplicateOf)
      if (canonical && canonical.id !== issue.id) {
        result.triage = {
          verdict: "dismissed",
          reasoning: `Duplicate of ${verdict.duplicateOf}: ${verdict.reasoning}`,
        }
        return result
      }
    }

    // Apply recategorize: correct severity/category if the triage model suggests it
    if (flags.recategorize) {
      if (verdict.correctedSeverity && VALID_SEVERITIES.has(verdict.correctedSeverity)) {
        result.severity = verdict.correctedSeverity as ReviewIssue["severity"]
      }
      if (verdict.correctedCategory && VALID_CATEGORIES.has(verdict.correctedCategory)) {
        result.category = verdict.correctedCategory as ReviewIssue["category"]
      }
    }

    result.triage = { verdict: verdict.verdict, reasoning: verdict.reasoning }
    return result
  })

  return triaged
}

export function buildTriagePrompt(
  issues: ReviewIssue[],
  diffContent: string,
  triageInstructions: string,
  diffType?: string,
  flags?: TriageFlags,
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

  const dedupSection = flags?.deduplicate
    ? `\n\n## Deduplication\nMultiple reviewers may have flagged the same underlying issue. If two or more issues describe the same problem (even with different wording), mark all but the best-described one as duplicates by setting "duplicateOf" to the ID of the canonical issue.`
    : ""

  const recategorizeSection = flags?.recategorize
    ? `\n\n## Re-categorization\nIf a reviewer has assigned the wrong severity or category, correct it. Set "correctedSeverity" and/or "correctedCategory" only when the original classification is clearly wrong. Valid severities: low, medium, high, critical. Valid categories: bug, security, performance, style, compliance, architecture.`
    : ""

  const extraFields = (flags?.deduplicate || flags?.recategorize)
    ? [
        ...(flags.deduplicate ? [`      "duplicateOf": "canonical-issue-id or null"`] : []),
        ...(flags.recategorize ? [
          `      "correctedSeverity": "low | medium | high | critical or null",`,
          `      "correctedCategory": "bug | security | performance | style | compliance | architecture or null"`,
        ] : []),
      ].join(",\n")
    : ""

  const extraFieldsBlock = extraFields ? `,\n${extraFields}` : ""

  return `${triageInstructions}${dedupSection}${recategorizeSection}

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
      "reasoning": "1-2 sentences explaining your position"${extraFieldsBlock}
    }
  ]
}`
}

export type RawTriageVerdict = {
  id: string
  verdict: "actionable" | "deferred" | "dismissed"
  reasoning: string
  duplicateOf?: string
  correctedSeverity?: string
  correctedCategory?: string
}

async function callTriageAgent(prompt: string, config: Config): Promise<RawTriageVerdict[]> {
  const { runtime, model } = config.triage
  const promptFile = path.join(os.tmpdir(), `crev-prompt-triage-${process.pid}-${uniqueSuffix()}.txt`)
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
          duplicateOf: v.duplicateOf ? String(v.duplicateOf) : undefined,
          correctedSeverity: v.correctedSeverity ? String(v.correctedSeverity) : undefined,
          correctedCategory: v.correctedCategory ? String(v.correctedCategory) : undefined,
        }
      })
      .filter((v) => v.id)
  } catch {
    return []
  }
}
