import { execFile } from "node:child_process"
import fs from "node:fs"
import { promisify } from "node:util"
import YAML from "yaml"
import type { Config } from "./config.js"
import { extractAndParse } from "./json-extract.js"
import { callLlm } from "./llm.js"
import { listAllSchemas, resolveSchemaPath } from "./schema.js"
import type { DiffSource } from "./types.js"
import { errorMessage } from "../util/cli-errors.js"

const execFileAsync = promisify(execFile)

export type DiffStats = {
  filesChanged: number
  insertions: number
  deletions: number
}

export type SchemaCandidate = {
  name: string
  description: string
}

export type AutoSelectResult = {
  schema: string
  reasoning: string
}

/**
 * Select the best schema based on diff characteristics and available schema descriptions.
 * Returns the name of the selected schema.
 */
export async function autoSelectSchema(
  crevDir: string,
  config: Config,
  source: DiffSource,
  analyze: boolean,
): Promise<AutoSelectResult> {
  const candidates = getSchemaDescriptions(crevDir)

  if (candidates.length === 0) {
    throw new Error("No schemas found. Run `crev init` or create a schema in .crev/schemas/")
  }

  if (candidates.length === 1) {
    return { schema: candidates[0].name, reasoning: "Only one schema available" }
  }

  const stats = analyze ? null : await getDiffStats(source)
  return selectWithLlm(candidates, stats, analyze, config)
}

export function getSchemaDescriptions(crevDir: string): SchemaCandidate[] {
  const names = listAllSchemas(crevDir)
  const candidates: SchemaCandidate[] = []

  for (const name of names) {
    const schemaPath = resolveSchemaPath(name, crevDir)
    if (!schemaPath) continue

    try {
      const raw = fs.readFileSync(schemaPath, "utf-8")
      const parsed = YAML.parse(raw)
      const description = parsed?.description ?? ""
      const reviewerCount = Array.isArray(parsed?.reviewers) ? parsed.reviewers.length : 0
      const reviewerNames = Array.isArray(parsed?.reviewers)
        ? parsed.reviewers.map((r: { name?: string }) => r.name ?? "unnamed").join(", ")
        : ""

      candidates.push({
        name,
        description: [
          description,
          reviewerCount > 0 ? `(${reviewerCount} reviewers: ${reviewerNames})` : "",
        ].filter(Boolean).join(" "),
      })
    } catch {
      // Skip schemas that can't be parsed
    }
  }

  return candidates
}

export async function getDiffStats(source: DiffSource): Promise<DiffStats> {
  try {
    let args: string[]

    switch (source.kind) {
      case "pr":
        // For PRs, use gh to get the diff and count with git
        return getDiffStatsFromPr(String(source.pr))
      case "commit":
        args = ["diff", "--shortstat", `${source.baseCommit}...HEAD`]
        break
      case "branch":
        if (source.type === "uncommitted") {
          args = ["diff", "--shortstat"]
        } else if (source.type === "committed") {
          args = ["diff", "--shortstat", `${source.base}...HEAD`]
        } else {
          args = ["diff", "--shortstat", source.base]
        }
        break
      case "local":
        if (source.type === "uncommitted") {
          args = ["diff", "--shortstat"]
        } else if (source.type === "committed") {
          args = ["diff", "--shortstat", "HEAD~1..HEAD"]
        } else {
          // all: staged + unstaged
          args = ["diff", "--shortstat", "HEAD"]
        }
        break
    }

    const { stdout } = await execFileAsync("git", args)
    return parseShortstat(stdout)
  } catch {
    return { filesChanged: 0, insertions: 0, deletions: 0 }
  }
}

async function getDiffStatsFromPr(pr: string): Promise<DiffStats> {
  try {
    const { stdout } = await execFileAsync("gh", ["pr", "diff", pr, "--name-only"])
    const files = stdout.trim().split("\n").filter(Boolean)
    // Can't easily get line counts from gh without fetching the whole diff,
    // so estimate from file count
    return { filesChanged: files.length, insertions: 0, deletions: 0 }
  } catch {
    return { filesChanged: 0, insertions: 0, deletions: 0 }
  }
}

export function parseShortstat(stat: string): DiffStats {
  const files = stat.match(/(\d+) files? changed/)
  const insertions = stat.match(/(\d+) insertions?/)
  const deletions = stat.match(/(\d+) deletions?/)
  return {
    filesChanged: files ? Number.parseInt(files[1], 10) : 0,
    insertions: insertions ? Number.parseInt(insertions[1], 10) : 0,
    deletions: deletions ? Number.parseInt(deletions[1], 10) : 0,
  }
}

export function buildSelectionPrompt(
  candidates: SchemaCandidate[],
  stats: DiffStats | null,
  analyze: boolean,
): string {
  const schemaList = candidates
    .map((c) => `- "${c.name}": ${c.description || "(no description)"}`)
    .join("\n")

  const contextSection = analyze
    ? "This is a full codebase analysis (--analyze), not a diff review."
    : stats
      ? `Diff stats: ${stats.filesChanged} files changed, ${stats.insertions} insertions(+), ${stats.deletions} deletions(-)`
      : "Diff stats unavailable."

  return `You are selecting the best review schema for a code review.

## Available schemas
${schemaList}

## Context
${contextSection}

## Task
Pick the single most appropriate schema for this review. Consider:
- Smaller/simpler changes benefit from lighter schemas (fewer reviewers, faster)
- Larger/riskier changes benefit from more thorough schemas (more reviewers, multi-perspective)
- Full codebase analysis typically needs thorough review

Respond ONLY with valid JSON:
{
  "schema": "the-schema-name",
  "reasoning": "1 sentence why"
}`
}

async function selectWithLlm(
  candidates: SchemaCandidate[],
  stats: DiffStats | null,
  analyze: boolean,
  config: Config,
): Promise<AutoSelectResult> {
  const prompt = buildSelectionPrompt(candidates, stats, analyze)
  const runtime = config.normalizer.runtime
  const model = config.normalizer.model

  try {
    const raw = await callLlm({ taskName: "Auto-Schema", runtime, model, prompt })
    return parseSelectionResponse(raw, candidates)
  } catch (err) {
    // Fallback: pick the first schema alphabetically
    const fallback = candidates[0].name
    console.error(
      `Warning: Auto schema selection failed (${runtime}/${model}): ${errorMessage(err)}. Using "${fallback}".`,
    )
    return { schema: fallback, reasoning: "Fallback after selection failure" }
  }
}

export function parseSelectionResponse(raw: string, candidates: SchemaCandidate[]): AutoSelectResult {
  const validNames = new Set(candidates.map((c) => c.name))
  const parsed = extractAndParse(raw, "schema")

  if (parsed?.schema && validNames.has(String(parsed.schema))) {
    return {
      schema: String(parsed.schema),
      reasoning: String(parsed.reasoning ?? ""),
    }
  }

  // Fallback: pick first schema
  return {
    schema: candidates[0].name,
    reasoning: "Could not parse LLM response, using first available schema",
  }
}
