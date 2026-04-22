import { getRuntime } from "@caiokf/valet"
import type { Config } from "./config.js"
import { extractAndParse } from "./json-extract.js"
import type { ReviewIssue, TriageCommentEnrichment } from "./types.js"
import { REVIEW_CATEGORY_SET, REVIEW_SEVERITY_SET, TRIAGE_VERDICT_SET, MAX_DIFF_CHARS } from "./taxonomy.js"
import { withTempPromptFile } from "./temp-prompt.js"
import { errorMessage } from "../util/cli-errors.js"

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
  enrichComments: boolean
}

const VALID_SEVERITIES = REVIEW_SEVERITY_SET
const VALID_CATEGORIES = REVIEW_CATEGORY_SET

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
    enrichComments: config.triage.enrichComments ?? false,
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
          enrichment: verdict.enrichment,
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

    result.triage = {
      verdict: verdict.verdict,
      reasoning: verdict.reasoning,
      enrichment: verdict.enrichment,
    }
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

  const enrichmentSection = flags?.enrichComments
    ? `\n\n## Comment Enrichment\nFor each issue, include "enrichment" so downstream agents can post a CodeRabbit-style PR comment.
- title: short imperative title (for example "Add IAM permission for the new secret")
- context: 1 short paragraph referencing evidence, file path(s), and line number(s)
- minimalFix.summary: one-line fix strategy
- minimalFix.language: code fence language like "diff", "ts", "js", "yaml", "bash", or "text"
- minimalFix.patch: small concrete patch/snippet (minimal viable fix, no placeholders)
- promptForAgents: direct instructions another agent can run to verify/fix this issue`
    : ""

  const extraFields = [
    ...(flags?.deduplicate ? [`      "duplicateOf": "canonical-issue-id or null"`] : []),
    ...(flags?.recategorize ? [
      `      "correctedSeverity": "low | medium | high | critical or null"`,
      `      "correctedCategory": "bug | security | performance | style | compliance | architecture or null"`,
    ] : []),
    ...(flags?.enrichComments ? [
      `      "enrichment": {
        "title": "short issue headline",
        "context": "what is wrong + where + why it matters",
        "minimalFix": {
          "summary": "single-line fix strategy",
          "language": "diff | ts | js | yaml | bash | text",
          "patch": "small concrete patch/snippet"
        },
        "promptForAgents": "explicit instructions to validate + implement the fix"
      }`,
    ] : []),
  ].join(",\n")

  const extraFieldsBlock = extraFields ? `,\n${extraFields}` : ""

  return `${triageInstructions}${dedupSection}${recategorizeSection}${enrichmentSection}

${diffType === "analyze"
    ? `## Scope\nThis is a full codebase analysis, not a diff review. The issues below reference files in the repository.`
    : `## The diff being reviewed\n\`\`\`diff\n${diffContent.slice(0, MAX_DIFF_CHARS)}\n\`\`\``}

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
  enrichment?: TriageCommentEnrichment
}

async function callTriageAgent(prompt: string, config: Config): Promise<RawTriageVerdict[]> {
  const { runtime, model } = config.triage
  try {
    return await withTempPromptFile("crev-prompt-triage", prompt, async (promptFile) => {
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
    })
  } catch (err) {
    console.error(`Warning: Triage failed (${runtime}/${model}): ${errorMessage(err)}`)
    return []
  }
}

export function parseTriageResponse(raw: string): RawTriageVerdict[] {
  const parsed = extractAndParse(raw, "triage")
  if (!parsed || !Array.isArray(parsed.triage)) return []

  return (parsed.triage as unknown[])
    .map((item) => {
      const v = item as Record<string, unknown>
      const verdict = String(v.verdict ?? "actionable")
      return {
        id: String(v.id ?? ""),
        verdict: (TRIAGE_VERDICT_SET.has(verdict) ? verdict : "actionable") as RawTriageVerdict["verdict"],
        reasoning: String(v.reasoning ?? ""),
        duplicateOf: v.duplicateOf ? String(v.duplicateOf) : undefined,
        correctedSeverity: v.correctedSeverity ? String(v.correctedSeverity) : undefined,
        correctedCategory: v.correctedCategory ? String(v.correctedCategory) : undefined,
        enrichment: parseEnrichment(v.enrichment),
      }
    })
    .filter((v) => v.id)
}

function parseEnrichment(value: unknown): TriageCommentEnrichment | undefined {
  if (!value || typeof value !== "object") return undefined
  const obj = value as Record<string, unknown>
  const minimalFixRaw = obj.minimalFix
  if (!minimalFixRaw || typeof minimalFixRaw !== "object") return undefined
  const minimalFix = minimalFixRaw as Record<string, unknown>

  const title = String(obj.title ?? "").trim()
  const context = String(obj.context ?? "").trim()
  const summary = String(minimalFix.summary ?? "").trim()
  const patch = String(minimalFix.patch ?? "").trim()
  const promptForAgents = String(obj.promptForAgents ?? "").trim()
  if (!title || !context || !summary || !patch || !promptForAgents) return undefined

  const languageRaw = String(minimalFix.language ?? "").trim()
  return {
    title,
    context,
    minimalFix: {
      summary,
      language: languageRaw || undefined,
      patch,
    },
    promptForAgents,
  }
}
