import crypto from "node:crypto"
import type { Config } from "./config.js"
import { resolveModelAlias, getRuntimeConfig } from "./config.js"
import { extractAndParse } from "./json-extract.js"
import { callLlm } from "./llm.js"
import type { NormalizedReview, ReviewIssue } from "./types.js"
import { REVIEW_CATEGORIES, REVIEW_SEVERITIES, MAX_RAW_CHARS } from "./taxonomy.js"
import { errorMessage } from "../util/cli-errors.js"
import { slugify } from "../util/paths.js"

export async function normalizeOutput(
  reviewerName: string,
  runtime: string,
  model: string,
  raw: string,
  durationMs: number,
  exitCode: number,
  config: Config,
  signal?: AbortSignal,
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
    const extracted = await extractWithNormalizer(raw, reviewerName, runtime, model, config, signal)
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
      status: normalizeStatus(String(item.status ?? "open")),
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

function normalizeStatus(s: string): NonNullable<ReviewIssue["status"]> {
  const valid = ["open", "fixed", "wont-fix"] as const
  const lower = s.toLowerCase()
  return (valid.find((v) => v === lower) ?? "open") as NonNullable<ReviewIssue["status"]>
}

export function prefixId(id: string, reviewer: string): string {
  const prefix = reviewerIdPrefix(reviewer)
  if (id.startsWith(`${prefix}--`)) return id
  return `${prefix}--${id}`
}

/**
 * Build a collision-resistant id prefix from a reviewer name.
 *
 * Plain slugify() maps "A/B" and "A B" to the same "a-b", so two
 * reviewers in the same schema could produce identical issue IDs and
 * corrupt triage / merge (both of which key by id). Append a short
 * SHA-256 tag of the exact reviewer name so distinct names always
 * produce distinct prefixes while the human-readable slug stays
 * recognisable in filenames and URLs.
 */
export function reviewerIdPrefix(reviewer: string): string {
  const slug = slugify(reviewer)
  const hash = crypto.createHash("sha256").update(reviewer).digest("hex").slice(0, 4)
  return `${slug}-${hash}`
}

async function extractWithNormalizer(
  raw: string,
  reviewer: string,
  runtime: string,
  model: string,
  config: Config,
  signal?: AbortSignal,
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
      "status": "open | fixed | wont-fix",
      "title": "Short title",
      "description": "Detailed description"
    }
  ]
}

If there are no issues, return: { "issues": [] }

Raw review output:
${raw.slice(0, MAX_RAW_CHARS)}`

  const normalizerRuntime = config.normalizer.runtime
  const normalizerModel = resolveModelAlias(config, config.normalizer.model)
  const rtConfig = getRuntimeConfig(config, normalizerRuntime)

  try {
    const raw = await callLlm({
      taskName: "Normalizer",
      runtime: normalizerRuntime,
      model: normalizerModel,
      prompt,
      signal,
      runtimeConfig: {
        command: rtConfig.command,
        env: rtConfig.env,
        args: rtConfig.args,
      },
    })
    const parsed = tryParseIssues(raw, reviewer, runtime, model)
    return parsed.parsed ? parsed.issues : []
  } catch (err) {
    console.error(`Warning: Normalizer failed for "${reviewer}" (${normalizerRuntime}/${normalizerModel}): ${errorMessage(err)}`)
    return []
  }
}
