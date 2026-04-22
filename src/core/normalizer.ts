import { getRuntime } from "@caiokf/valet"
import type { Config } from "./config.js"
import { extractAndParse } from "./json-extract.js"
import type { NormalizedReview, ReviewIssue } from "./types.js"
import { REVIEW_CATEGORIES, REVIEW_SEVERITIES } from "./taxonomy.js"
import { withTempPromptFile } from "./temp-prompt.js"

export async function normalizeOutput(
  reviewerName: string,
  runtime: string,
  model: string,
  raw: string,
  durationMs: number,
  exitCode: number,
  config: Config,
): Promise<NormalizedReview> {
  const base: Omit<NormalizedReview, "issues"> = {
    reviewer: reviewerName,
    runtime,
    model,
    durationMs,
    exitCode,
    rawLength: raw.length,
  }

  const directParse = tryParseIssues(raw, reviewerName, runtime, model)
  if (directParse.parsed) {
    return { ...base, issues: directParse.issues }
  }

  if (config.normalizer.enabled) {
    const extracted = await extractWithNormalizer(raw, reviewerName, runtime, model, config)
    return { ...base, issues: extracted }
  }

  return { ...base, issues: [] }
}

export type ParseResult = { parsed: true; issues: ReviewIssue[] } | { parsed: false }

export function tryParseIssues(raw: string, reviewer: string, runtime: string, model: string): ParseResult {
  const parsed = extractAndParse(raw, "issues")
  if (!parsed || !Array.isArray(parsed.issues)) return { parsed: false }

  const issues = (parsed.issues as unknown[]).map((issue, i) => {
    const item = issue as Record<string, unknown>
    return {
      id: prefixId(String(item.id ?? `${i + 1}`), reviewer),
      reviewer,
      runtime,
      model,
      file: item.file ? String(item.file) : undefined,
      line: typeof item.line === "number" ? item.line : undefined,
      severity: normalizeSeverity(String(item.severity ?? "medium")),
      category: normalizeCategory(String(item.category ?? "bug")),
      title: String(item.title ?? "Untitled issue"),
      description: String(item.description ?? ""),
    }
  })
  return { parsed: true, issues }
}

function normalizeSeverity(s: string): ReviewIssue["severity"] {
  const lower = s.toLowerCase()
  return (REVIEW_SEVERITIES.find((v) => v === lower) ?? "medium") as ReviewIssue["severity"]
}

function normalizeCategory(c: string): ReviewIssue["category"] {
  const lower = c.toLowerCase()
  return (REVIEW_CATEGORIES.find((v) => v === lower) ?? "bug") as ReviewIssue["category"]
}

export function prefixId(id: string, reviewer: string): string {
  const prefix = reviewer
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+$/, "")
  if (id.startsWith(`${prefix}--`)) return id
  return `${prefix}--${id}`
}

async function extractWithNormalizer(
  raw: string,
  reviewer: string,
  runtime: string,
  model: string,
  config: Config,
): Promise<ReviewIssue[]> {
  const prompt = `You are a JSON extraction assistant. Extract code review issues from the following review output and return valid JSON.

The review was produced by "${reviewer}" using the ${runtime} runtime (model: ${model}).

Return ONLY a JSON object with this exact structure:
{
  "issues": [
    {
      "id": "unique-id",
      "file": "path/to/file.ts",
      "line": 42,
      "severity": "low | medium | high | critical",
      "category": "bug | security | performance | style | compliance | architecture",
      "title": "Short title",
      "description": "Detailed description"
    }
  ]
}

If there are no issues, return: { "issues": [] }

Raw review output:
${raw.slice(0, 100_000)}`

  const normalizerRuntime = config.normalizer.runtime
  const normalizerModel = config.normalizer.model

  try {
    return await withTempPromptFile("crev-prompt-normalizer", prompt, async (promptFile) => {
      const rt = getRuntime(normalizerRuntime)
      const result = await rt.execute({
        taskName: "Normalizer",
        model: normalizerModel,
        prompt,
        promptFile,
        diff: { diffContent: "", diffFile: "", type: "all" },
        outputFormat: "",
      })

      const parsed = tryParseIssues(result.raw, reviewer, runtime, model)
      return parsed.parsed ? parsed.issues : []
    })
  } catch (err) {
    console.error(`Warning: Normalizer failed for "${reviewer}" (${normalizerRuntime}/${normalizerModel}): ${err instanceof Error ? err.message : String(err)}`)
    return []
  }
}
