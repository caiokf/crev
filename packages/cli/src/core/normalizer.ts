import { execAbortable } from "@crev/runtimes"
import type { Config } from "./config.js"
import { extractJsonObject } from "./json-extract.js"
import type { NormalizedReview, ReviewIssue } from "./types.js"

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
  const jsonStr = extractJsonObject(raw, "issues")
  if (!jsonStr) return { parsed: false }

  try {
    const parsed = JSON.parse(jsonStr) as { issues?: unknown[] }
    if (!Array.isArray(parsed.issues)) return { parsed: false }

    const issues = parsed.issues.map((issue, i) => {
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
  } catch {
    return { parsed: false }
  }
}

function normalizeSeverity(s: string): ReviewIssue["severity"] {
  const valid = ["low", "medium", "high", "critical"] as const
  const lower = s.toLowerCase()
  return (valid.find((v) => v === lower) ?? "medium") as ReviewIssue["severity"]
}

function normalizeCategory(c: string): ReviewIssue["category"] {
  const valid = ["bug", "security", "performance", "style", "compliance", "architecture"] as const
  const lower = c.toLowerCase()
  return (valid.find((v) => v === lower) ?? "bug") as ReviewIssue["category"]
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

  try {
    const normalizerRuntime = config.normalizer.runtime
    const normalizerModel = config.normalizer.model

    if (normalizerRuntime === "claude") {
      const modelId =
        normalizerModel === "haiku"
          ? "claude-haiku-4-5-20251001"
          : normalizerModel === "sonnet"
            ? "claude-sonnet-4-6"
            : normalizerModel
      const { stdout } = await execAbortable("claude", ["--print", "--model", modelId], {
        maxBuffer: 50 * 1024 * 1024,
        timeout: 2 * 60 * 1000,
        stdin: prompt,
      })
      const result = tryParseIssues(stdout, reviewer, runtime, model)
      return result.parsed ? result.issues : []
    }

    return []
  } catch (err) {
    console.error(`Warning: Normalizer failed for "${reviewer}" (${runtime}/${model}): ${err instanceof Error ? err.message : String(err)}`)
    return []
  }
}
