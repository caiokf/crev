import type { Config } from "./config.js"
import { extractAndParse } from "./json-extract.js"
import { callLlm } from "./llm.js"
import type { ReviewIssue, TriageCommentEnrichment } from "./types.js"
import { REVIEW_CATEGORY_SET, REVIEW_SEVERITY_SET, TRIAGE_VERDICT_SET, MAX_DIFF_CHARS } from "./taxonomy.js"
import { errorMessage } from "../util/cli-errors.js"

type TriageInput = {
  issues: ReviewIssue[]
  diffContent: string
  diffType?: string
  config: Config
  signal?: AbortSignal
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
  const { issues, diffContent, diffType, config, signal } = input

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
    enrichComments: config.triage.enrichComments ?? true,
  }

  const prompt = buildTriagePrompt(issues, diffContent, config.triage.prompt, diffType, flags)
  const verdicts = await callTriageAgent(prompt, config, signal)

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
    ? `\n\n## Comment Enrichment
For each issue, include "enrichment" so downstream agents can post a CodeRabbit-style PR comment.

**Critical rule:** enrichment MUST be written as if the issue were actionable, regardless of the verdict you assign. The verdict alone controls whether an agent will actually run the fix — the enrichment is a reusable fix recipe that must still make sense if a human later flips the verdict to "actionable". Never write passive language like "no action required", "do nothing", "skip this", or "since this is dismissed…". Write every field as concrete fix guidance.

- title: short imperative title describing the fix (for example "Add IAM permission for the new secret")
- context: 1 short paragraph explaining what is wrong, where (file path(s) + line number(s)), and why it matters — phrased as a problem statement, not a verdict justification
- minimalFix.summary: one-line fix strategy (imperative voice)
- minimalFix.language: code fence language like "diff", "ts", "js", "yaml", "bash", or "text"
- minimalFix.patch: small concrete patch/snippet that implements the minimal viable fix (no placeholders, no "N/A")
- promptForAgents: direct, imperative instructions another agent can run to verify AND implement the fix. Must be a usable fix recipe on its own. Do NOT reference the verdict, and do NOT tell the agent to skip or defer.`
    : ""

  const extraFields = [
    ...(flags?.deduplicate ? [`      "duplicateOf": "canonical-issue-id or null"`] : []),
    ...(flags?.recategorize ? [
      `      "correctedSeverity": "low | medium | high | critical or null"`,
      `      "correctedCategory": "bug | security | performance | style | compliance | architecture or null"`,
    ] : []),
    ...(flags?.enrichComments ? [
      `      "enrichment": {
        "title": "short imperative fix headline",
        "context": "problem statement: what is wrong + where + why it matters (always phrased as if fixing)",
        "minimalFix": {
          "summary": "single-line fix strategy (imperative)",
          "language": "diff | ts | js | yaml | bash | text",
          "patch": "concrete minimal patch/snippet that implements the fix"
        },
        "promptForAgents": "imperative instructions to validate + implement the fix, usable standalone regardless of verdict"
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

async function callTriageAgent(
  prompt: string,
  config: Config,
  signal?: AbortSignal,
): Promise<RawTriageVerdict[]> {
  const { runtime, model } = config.triage
  try {
    const raw = await callLlm({ taskName: "Triage", runtime, model, prompt, signal })
    return parseTriageResponse(raw)
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
